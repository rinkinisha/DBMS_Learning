import type { DailyChampionCandidate } from './storeTypes.ts';

export function selectDailyWinners(candidates: DailyChampionCandidate[]): DailyChampionCandidate[] {
  if (!candidates.length) return [];
  const highestConcepts = Math.max(...candidates.map((candidate) => candidate.concepts_completed));
  const mostXp = Math.max(...candidates.filter((candidate) => candidate.concepts_completed === highestConcepts)
    .map((candidate) => candidate.xp_earned));
  return candidates.filter((candidate) => candidate.concepts_completed === highestConcepts && candidate.xp_earned === mostXp);
}

export function buildChampionAnnouncement(winners: DailyChampionCandidate[]): string {
  const shoutouts = winners.map((winner) => winner.discord_user_id
    ? `Congratulations <@${winner.discord_user_id}>!`
    : `Congratulations ${winner.name}! (Discord account not linked)`);
  const lead = winners.length > 1
    ? '🏆 **DBMS Arena – Daily Learning Champions!**'
    : '🏆 **DBMS Arena – Daily Learning Champion!**';
  const stats = `- Concepts completed today: ${winners[0].concepts_completed}\n- XP earned today: ${winners[0].xp_earned}`;
  return `${lead}\n\n${shoutouts.join('\n')}\n${stats}`;
}
