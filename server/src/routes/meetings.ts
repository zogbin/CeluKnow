import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { run, runInsert, runUpdate } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

function isMeetingExpired(meetingEnd: string): boolean {
  const endTime = new Date(meetingEnd).getTime();
  const now = Date.now();
  const oneHourLater = endTime + 60 * 60 * 1000;
  return now > oneHourLater;
}

function isMeetingActive(meetingStart: string, meetingEnd: string): boolean {
  const startTime = new Date(meetingStart).getTime();
  const endTime = new Date(meetingEnd).getTime();
  const now = Date.now();
  return now >= startTime && now <= endTime;
}

function canAccessMeeting(userId: number, meeting: any): boolean {
  if (meeting.organizer_id === userId) return true;
  const attendee = run(`SELECT * FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?`, [meeting.id, userId])[0];
  return !!attendee;
}

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    let meetings: any[];
    
    if (userRole === 'admin') {
      meetings = run(`
        SELECT m.*, u.username as organizer_name,
          (SELECT COUNT(*) FROM meeting_materials WHERE meeting_id = m.id AND is_folder = 0) as materials_count
        FROM meetings m
        LEFT JOIN users u ON m.organizer_id = u.id
        ORDER BY m.meeting_date DESC
      `);
    } else {
      meetings = run(`
        SELECT m.*, u.username as organizer_name,
          (SELECT COUNT(*) FROM meeting_materials WHERE meeting_id = m.id AND is_folder = 0) as materials_count
        FROM meetings m
        LEFT JOIN users u ON m.organizer_id = u.id
        WHERE m.organizer_id = ? OR EXISTS (
          SELECT 1 FROM meeting_attendees WHERE meeting_id = m.id AND user_id = ?
        )
        ORDER BY m.meeting_date DESC
      `, [userId, userId]);
    }
    
    const result = meetings.map((m: any) => ({
      ...m,
      expired: isMeetingExpired(m.meeting_end || m.meeting_date),
      is_organizer: m.organizer_id === userId
    }));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const meeting = run(`
      SELECT m.*, u.username as organizer_name
      FROM meetings m
      LEFT JOIN users u ON m.organizer_id = u.id
      WHERE m.id = ?
    `, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    
    if (!canAccessMeeting(userId, meeting)) {
      return res.status(403).json({ error: '您不是参会人员，无权查看' });
    }
    
    const expired = isMeetingExpired(meeting.meeting_end || meeting.meeting_date);
    const isOrganizer = meeting.organizer_id === userId;
    
    const materials = !expired ? run(`
      SELECT mm.*, u.username as uploader_name
      FROM meeting_materials mm
      LEFT JOIN users u ON mm.uploader_id = u.id
      WHERE mm.meeting_id = ?
      ORDER BY mm.sort_order ASC, mm.created_at DESC
    `, [id]) : [];
    
    const agendas = run(`
      SELECT ma.*, 
        (SELECT COUNT(*) FROM meeting_materials WHERE agenda_id = ma.id AND is_folder = 0) as materials_count
      FROM meeting_agendas ma
      WHERE ma.meeting_id = ?
      ORDER BY ma.sort_order ASC
    `, [id]);
    
    const attendees = run(`
      SELECT ma.id, ma.user_id, u.username
      FROM meeting_attendees ma
      LEFT JOIN users u ON ma.user_id = u.id
      WHERE ma.meeting_id = ?
    `, [id]);
    
    res.json({ ...meeting, materials, agendas, expired, is_organizer: isOrganizer, attendees });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { title, description, meeting_date, meeting_end, location, attendee_ids } = req.body;
    const userId = req.user?.id;
    if (!title || !meeting_date || !meeting_end) {
      return res.status(400).json({ error: '缺少必要字段' });
    }
    const meetingId = runInsert(`
      INSERT INTO meetings (title, description, meeting_date, meeting_end, location, organizer_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [title, description || '', meeting_date, meeting_end, location || '', userId]);
    
    if (Array.isArray(attendee_ids)) {
      for (const uid of attendee_ids) {
        try {
          runInsert(`INSERT INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)`, [meetingId, uid]);
        } catch {}
      }
    }
    
    res.json({ id: meetingId, message: '会议创建成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, meeting_date, meeting_end, location } = req.body;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '无权限修改' });
    }
    runUpdate(`
      UPDATE meetings SET title = ?, description = ?, meeting_date = ?, meeting_end = ?, location = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, description || '', meeting_date, meeting_end, location || '', id]);
    res.json({ message: '会议更新成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '无权限删除' });
    }
    runUpdate(`DELETE FROM meeting_materials WHERE meeting_id = ?`, [id]);
    runUpdate(`DELETE FROM meeting_agendas WHERE meeting_id = ?`, [id]);
    runUpdate(`DELETE FROM meeting_attendees WHERE meeting_id = ?`, [id]);
    runUpdate(`DELETE FROM meetings WHERE id = ?`, [id]);
    res.json({ message: '会议删除成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/attendees', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    const attendees = run(`
      SELECT ma.id, ma.user_id, u.username
      FROM meeting_attendees ma
      LEFT JOIN users u ON ma.user_id = u.id
      WHERE ma.meeting_id = ?
    `, [id]);
    res.json(attendees);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/attendees', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '无权限添加参会人员' });
    }
    runInsert(`INSERT OR IGNORE INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)`, [id, user_id]);
    res.json({ message: '参会人员添加成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/attendees/:userId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const currentUserId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== currentUserId) {
      return res.status(403).json({ error: '无权限移除参会人员' });
    }
    runUpdate(`DELETE FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?`, [id, parseInt(userId)]);
    res.json({ message: '参会人员移除成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/users/all', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const users = run(`SELECT id, username FROM users ORDER BY username`);
    res.json(users);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/materials', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '只有会议组织者才能添加资料' });
    }
    if (isMeetingExpired(meeting.meeting_end || meeting.meeting_date)) {
      return res.status(403).json({ error: '会议已过期，无法添加资料' });
    }
    const { title, file_path, file_type, description, content, is_folder, parent_id, agenda_id } = req.body;
    if (!title) {
      return res.status(400).json({ error: '缺少必要字段' });
    }
    const id2 = runInsert(`
      INSERT INTO meeting_materials (meeting_id, title, file_path, file_type, description, content, is_folder, parent_id, agenda_id, uploader_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, file_path || '', file_type || '', description || '', content || '', is_folder || 0, parent_id || null, agenda_id || null, userId]);
    res.json({ id: id2, message: '资料添加成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/materials/reorder', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { materials } = req.body;
    const userId = req.user?.id;
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: '无效数据' });
    }
    for (let i = 0; i < materials.length; i++) {
      const mat = run(`SELECT * FROM meeting_materials WHERE id = ?`, [materials[i].id])[0];
      if (!mat) continue;
      const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [mat.meeting_id])[0];
      if (meeting.organizer_id !== userId) {
        continue;
      }
      runUpdate(`UPDATE meeting_materials SET sort_order = ? WHERE id = ?`, [i, materials[i].id]);
    }
    res.json({ message: '排序更新成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/materials/:materialId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { materialId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const material = run(`SELECT * FROM meeting_materials WHERE id = ?`, [materialId])[0];
    if (!material) {
      return res.status(404).json({ error: '资料不存在' });
    }
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [material.meeting_id])[0];
    if (material.uploader_id !== userId && meeting.organizer_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: '无权限删除' });
    }
    if (material.is_folder) {
      runUpdate(`DELETE FROM meeting_materials WHERE parent_id = ?`, [materialId]);
    }
    runUpdate(`DELETE FROM meeting_materials WHERE id = ?`, [materialId]);
    res.json({ message: '资料删除成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/agendas', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    const userId = req.user?.id;
    if (!canAccessMeeting(userId, meeting)) {
      return res.status(403).json({ error: '无权限查看' });
    }
    const agendas = run(`
      SELECT ma.*, 
        (SELECT COUNT(*) FROM meeting_materials WHERE agenda_id = ma.id AND is_folder = 0) as materials_count
      FROM meeting_agendas ma
      WHERE ma.meeting_id = ?
      ORDER BY ma.sort_order ASC
    `, [id]);
    res.json(agendas);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/agendas', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '无权限添加议程' });
    }
    if (!title) {
      return res.status(400).json({ error: '缺少议程标题' });
    }
    const maxOrder = run(`SELECT MAX(sort_order) as max_order FROM meeting_agendas WHERE meeting_id = ?`, [id])[0];
    const sortOrder = (maxOrder?.max_order || 0) + 1;
    const agendaId = runInsert(`INSERT INTO meeting_agendas (meeting_id, title, sort_order) VALUES (?, ?, ?)`, [id, title, sortOrder]);
    res.json({ id: agendaId, message: '议程创建成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/agendas/:agendaId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id, agendaId } = req.params;
    const { title } = req.body;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '无权限修改议程' });
    }
    const agenda = run(`SELECT * FROM meeting_agendas WHERE id = ? AND meeting_id = ?`, [agendaId, id])[0];
    if (!agenda) {
      return res.status(404).json({ error: '议程不存在' });
    }
    runUpdate(`UPDATE meeting_agendas SET title = ? WHERE id = ?`, [title, agendaId]);
    res.json({ message: '议程更新成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/agendas/:agendaId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id, agendaId } = req.params;
    const userId = req.user?.id;
    const meeting = run(`SELECT * FROM meetings WHERE id = ?`, [id])[0];
    if (!meeting) {
      return res.status(404).json({ error: '会议不存在' });
    }
    if (meeting.organizer_id !== userId) {
      return res.status(403).json({ error: '无权限删除议程' });
    }
    const agenda = run(`SELECT * FROM meeting_agendas WHERE id = ? AND meeting_id = ?`, [agendaId, id])[0];
    if (!agenda) {
      return res.status(404).json({ error: '议程不存在' });
    }
    runUpdate(`DELETE FROM meeting_materials WHERE agenda_id = ?`, [agendaId]);
    runUpdate(`DELETE FROM meeting_agendas WHERE id = ?`, [agendaId]);
    res.json({ message: '议程删除成功' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const uploadDir = path.join(__dirname, '../../uploads/materials');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage });

router.post('/upload-material', authMiddleware, upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择文件' });
    }
    
    const meetingId = req.body.meeting_id;
    if (!meetingId) {
      return res.status(400).json({ error: '缺少会议ID' });
    }
    
    const filePath = `/uploads/materials/${req.file.filename}`;
    const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '');
    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    const fileType = ext.toUpperCase();
    
    res.json({
      path: filePath,
      title,
      file_type: fileType
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
 
export default router;