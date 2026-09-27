import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { applications, groupInvites, groupMembers, groups, posts, threads, users } from '../db/schema';
import { HttpError, requireUser, type User } from '../auth';
import type { Ctx } from '../context';
import { nowIso, uid } from '../services';
import { nameMap } from '../views';
import { SUBJECTS } from '../../shared/vocab';

/** Study groups are for students and approved tutors. */
export function groupRoutes(ctx: Ctx) {
  const { db } = ctx;
  const r = Router();

  function groupUser(req: Parameters<typeof requireUser>[0]) {
    const me = requireUser(req, 'student', 'teacher');
    if (me.role === 'teacher') {
      const app = db.select({ status: applications.status }).from(applications).where(eq(applications.userId, me.id)).get();
      if (app?.status !== 'approved') throw new HttpError(403, 'Groups open up once your application is approved.');
    }
    return me;
  }

  const memberIds = (gid: string) => db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, gid)).all().map((m) => m.id);
  const inviteRows = (gid: string) => db.select().from(groupInvites).where(eq(groupInvites.groupId, gid)).all();

  function loadGroup(gid: string, me: User, mustBeMember: boolean) {
    const g = db.select().from(groups).where(eq(groups.id, gid)).get();
    if (!g) throw new HttpError(404, 'Group not found.');
    const members = memberIds(gid);
    const invited = inviteRows(gid).some((i) => i.userId === me.id);
    const isMember = members.includes(me.id);
    if (!isMember && !(invited && !mustBeMember)) throw new HttpError(403, 'Only members can do that.');
    return { g, members, isMember };
  }

  r.get('/groups', (req, res) => {
    const me = groupUser(req);
    const invites = db.select().from(groupInvites).where(eq(groupInvites.userId, me.id)).all();
    const myIds = db.select({ id: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, me.id)).all().map((x) => x.id);
    const allIds = [...new Set([...myIds, ...invites.map((i) => i.groupId)])];
    const gs = allIds.length ? db.select().from(groups).where(inArray(groups.id, allIds)).all() : [];
    const mem = allIds.length ? db.select().from(groupMembers).where(inArray(groupMembers.groupId, allIds)).all() : [];
    const th = allIds.length ? db.select({ groupId: threads.groupId }).from(threads).where(inArray(threads.groupId, allIds)).all() : [];
    const who = nameMap(db, [...mem.map((m) => m.userId), ...invites.map((i) => i.invitedBy)]);
    const membersOf = (gid: string) => mem.filter((m) => m.groupId === gid).map((m) => m.userId);
    res.json({
      invites: invites.map((i) => {
        const g = gs.find((x) => x.id === i.groupId)!;
        return { groupId: g.id, name: g.name, by: who(i.invitedBy).name, members: membersOf(g.id).length };
      }),
      mine: gs
        .filter((g) => myIds.includes(g.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          subject: g.subject,
          isOwner: g.ownerId === me.id,
          faces: membersOf(g.id).slice(0, 5).map((id) => who(id).name),
          members: membersOf(g.id).length,
          threads: th.filter((t) => t.groupId === g.id).length,
        })),
    });
  });

  r.post('/groups', (req, res) => {
    const me = groupUser(req);
    const d = z
      .object({
        name: z.string().trim().min(3, 'Give the group a name.').max(80),
        description: z.string().trim().max(500).default(''),
        subject: z.string().refine((s) => (SUBJECTS as readonly string[]).includes(s), 'Choose a subject.'),
      })
      .parse(req.body);
    const id = uid('g_');
    const at = nowIso();
    db.transaction((tx) => {
      tx.insert(groups).values({ id, name: d.name, description: d.description, subject: d.subject, ownerId: me.id, createdAt: at }).run();
      tx.insert(groupMembers).values({ groupId: id, userId: me.id, joinedAt: at }).run();
    });
    res.status(201).json({ id });
  });

  r.get('/groups/:id', (req, res) => {
    const me = groupUser(req);
    const { g, members, isMember } = loadGroup(req.params.id, me, false);
    const invites = inviteRows(g.id);
    const ths = db.select().from(threads).where(eq(threads.groupId, g.id)).all().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const ps = ths.length ? db.select().from(posts).where(inArray(posts.threadId, ths.map((t) => t.id))).all() : [];
    const who = nameMap(db, [...members, ...invites.map((i) => i.userId), ...ths.map((t) => t.authorId), ...ps.map((p) => p.authorId)]);
    res.json({
      group: {
        id: g.id,
        name: g.name,
        description: g.description,
        subject: g.subject,
        isMember,
        members: members.map((id) => ({ id, name: who(id).name, role: who(id).role, owner: id === g.ownerId })),
        pending: invites.map((i) => who(i.userId).name),
        threads: ths.map((t) => {
          const tp = ps.filter((p) => p.threadId === t.id).sort((a, b) => a.id - b.id);
          return {
            id: t.id,
            title: t.title,
            author: who(t.authorId).name,
            replies: Math.max(0, tp.length - 1),
            posts: tp.map((p) => ({ id: p.id, author: who(p.authorId).name, isTutor: who(p.authorId).role === 'teacher', at: p.at, text: p.text })),
          };
        }),
      },
    });
  });

  r.post('/groups/:id/respond', (req, res) => {
    const me = groupUser(req);
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    const inv = db.select().from(groupInvites).where(and(eq(groupInvites.groupId, req.params.id), eq(groupInvites.userId, me.id))).get();
    if (!inv) throw new HttpError(404, 'Invitation not found.');
    db.transaction((tx) => {
      tx.delete(groupInvites).where(and(eq(groupInvites.groupId, inv.groupId), eq(groupInvites.userId, me.id))).run();
      if (accept) tx.insert(groupMembers).values({ groupId: inv.groupId, userId: me.id, joinedAt: nowIso() }).onConflictDoNothing().run();
    });
    res.json({ ok: true });
  });

  r.get('/groups/:id/invitable', (req, res) => {
    const me = groupUser(req);
    const { g, members } = loadGroup(req.params.id, me, true);
    const invited = new Set(inviteRows(g.id).map((i) => i.userId));
    const approved = new Set(db.select({ id: applications.userId }).from(applications).where(eq(applications.status, 'approved')).all().map((a) => a.id));
    const people = db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.status, 'active'), inArray(users.role, ['student', 'teacher'])))
      .all()
      .filter((u) => (u.role === 'student' || approved.has(u.id)) && !members.includes(u.id) && !invited.has(u.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ people: people.map((u) => ({ id: u.id, label: `${u.name} · ${u.role === 'teacher' ? 'Tutor' : 'Student'}` })) });
  });

  r.post('/groups/:id/invites', (req, res) => {
    const me = groupUser(req);
    const { g, members } = loadGroup(req.params.id, me, true);
    const { userId } = z.object({ userId: z.string().min(1, 'Choose someone to invite.') }).parse(req.body);
    const u = db.select().from(users).where(eq(users.id, userId)).get();
    if (!u || u.status !== 'active' || !['student', 'teacher'].includes(u.role)) throw new HttpError(404, 'That person can’t be invited.');
    if (members.includes(userId)) throw new HttpError(409, `${u.name} is already a member.`);
    db.insert(groupInvites).values({ groupId: g.id, userId, invitedBy: me.id }).onConflictDoNothing().run();
    res.status(201).json({ name: u.name });
  });

  r.post('/groups/:id/threads', (req, res) => {
    const me = groupUser(req);
    const { g } = loadGroup(req.params.id, me, true);
    const d = z
      .object({ title: z.string().trim().min(1, 'Add a title and a first message.').max(160), text: z.string().trim().min(1, 'Add a title and a first message.').max(5000) })
      .parse(req.body);
    const id = uid('th_');
    const at = nowIso();
    db.transaction((tx) => {
      tx.insert(threads).values({ id, groupId: g.id, title: d.title, authorId: me.id, createdAt: at }).run();
      tx.insert(posts).values({ threadId: id, authorId: me.id, at, text: d.text }).run();
    });
    res.status(201).json({ id });
  });

  r.post('/groups/:id/threads/:tid/posts', (req, res) => {
    const me = groupUser(req);
    const { g } = loadGroup(req.params.id, me, true);
    const t = db.select().from(threads).where(and(eq(threads.id, req.params.tid), eq(threads.groupId, g.id))).get();
    if (!t) throw new HttpError(404, 'Discussion not found.');
    const { text } = z.object({ text: z.string().trim().min(1).max(5000) }).parse(req.body);
    db.insert(posts).values({ threadId: t.id, authorId: me.id, at: nowIso(), text }).run();
    res.status(201).json({ ok: true });
  });

  return r;
}
