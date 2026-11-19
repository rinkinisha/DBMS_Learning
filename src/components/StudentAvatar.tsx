interface StudentAvatarProps {
  name: string;
  seed?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const PALETTES = [
  'bg-emerald-600 text-white',
  'bg-sky-600 text-white',
  'bg-amber-500 text-white',
  'bg-indigo-600 text-white',
  'bg-rose-600 text-white',
  'bg-teal-600 text-white',
  'bg-orange-600 text-white',
  'bg-cyan-700 text-white',
];

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function StudentAvatar({ name, seed = '', size = 'md' }: StudentAvatarProps) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (name.slice(0, 2) || 'DB').toUpperCase();

  const colorClass = PALETTES[hashSeed(seed || name) % PALETTES.length];
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs rounded-lg'
      : size === 'lg'
        ? 'w-14 h-14 text-lg rounded-2xl'
        : size === 'xl'
          ? 'w-20 h-20 text-2xl rounded-2xl'
          : 'w-10 h-10 text-sm rounded-xl';

  return (
    <div
      className={`${sizeClass} ${colorClass} font-display font-bold flex items-center justify-center shrink-0 select-none shadow-xs`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
