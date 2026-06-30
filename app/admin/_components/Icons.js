"use client";

const ICONS = {
  trophy: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 15l-3 6h6l-3-6zm0 0V9m0 6c-4 0-7-2.5-7-6V3h14v6c0 3.5-3 6-7 6zM5 3H3v3c0 1.5.7 2.8 2 3.7M19 3h2v3c0 1.5-.7 2.8-2 3.7" />
  ),
  chart: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 3v18h18M7 16l4-4 4 4 4-8" />
  ),
  fire: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 2c0 4-3 6-3 9a3 3 0 006 0c0-3-3-5-3-9zm-2 13a2 2 0 004 0" />
  ),
  trending: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M22 7l-9.5 9.5-4-4L2 19M16 7h6v6" />
  ),
  refresh: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  ),
  camera: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  bell: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  ),
  eye: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  ),
  mail: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  ),
  star: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  ),
  tag: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M7 7h.01M7 3h5l8.5 8.5a1.5 1.5 0 010 2.121L14.5 20a1.5 1.5 0 01-2.121 0L3.879 12.5A1.5 1.5 0 013 11.5V7a4 4 0 014-4z" />
  ),
  gavel: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 4L6 10l-3 3 3 3 6-6 6 6 3-3-3-3-6-6zm0 0v16M4 20h16" />
  ),
  envelope: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  ),
  database: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3v10c0 1.657-3.582 3-8 3s-8-1.343-8-3V7zM4 12c0 1.657 3.582 3 8 3s8-1.343 8-3M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3" />
  ),
  cpu: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 3H7a2 2 0 00-2 2v2M9 3h6M9 3v2M15 3h2a2 2 0 012 2v2M15 3v2M3 9v6M21 9v6M9 21H7a2 2 0 01-2-2v-2M9 21h6M9 21v-2M15 21h2a2 2 0 002-2v-2M15 21v-2M9 9h6v6H9V9z" />
  ),
  checkCircle: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  xCircle: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  clock: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  play: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
  ),
};

export default function Icon({ name, size = 18, color = "currentColor", className = "" }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {path}
    </svg>
  );
}
