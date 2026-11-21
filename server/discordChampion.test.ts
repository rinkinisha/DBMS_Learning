import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChampionAnnouncement, selectDailyWinners } from './discordChampion.ts';
import type { DailyChampionCandidate } from './storeTypes.ts';

const candidates: DailyChampionCandidate[] = [
  { student_id: 1, name: 'Asha', username: 'asha', discord_user_id: '12345678901234567', concepts_completed: 4, xp_earned: 120 },
  { student_id: 2, name: 'Dev', username: 'dev', discord_user_id: null, concepts_completed: 5, xp_earned: 80 },
  { student_id: 3, name: 'Mina', username: 'mina', discord_user_id: '22345678901234567', concepts_completed: 5, xp_earned: 100 },
  { student_id: 4, name: 'Ravi', username: 'ravi', discord_user_id: '32345678901234567', concepts_completed: 5, xp_earned: 100 },
];

test('daily champion selection prioritizes completed concepts, then XP, and retains all remaining ties', () => {
  assert.deepEqual(selectDailyWinners(candidates).map((candidate) => candidate.student_id), [3, 4]);
  assert.deepEqual(selectDailyWinners([]), []);
});

test('champion announcement mentions linked Discord users and handles unlinked winners by name', () => {
  const winners = selectDailyWinners(candidates);
  assert.match(buildChampionAnnouncement(winners), /<@22345678901234567>/);
  assert.match(buildChampionAnnouncement(winners), /<@32345678901234567>/);
  assert.match(buildChampionAnnouncement([candidates[1]]), /Congratulations Dev! \(Discord account not linked\)/);
});
