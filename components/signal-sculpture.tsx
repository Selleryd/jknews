'use client';
import { useEffect, useRef } from 'react';

/** Decorative optical sculpture. It never represents reporting or model data. */
export function SignalSculpture({ className = '', eager = false }: { className?: string; eager?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const surface = element.parentElement ?? element;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let intersecting = false;
    let frame = 0;
    let coordinates: { x: number; y: number } | null = null;
    const reset = () => {
      coordinates = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty('--signal-x', '0');
      element.style.setProperty('--signal-y', '0');
    };
    const updateActivity = () => {
      element.dataset.awake = String(intersecting && !document.hidden && !motion.matches);
      if (motion.matches || document.hidden || !intersecting) reset();
    };
    const observer = new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting);
      updateActivity();
    }, { threshold: .08 });
    observer.observe(element);
    const move = (event: PointerEvent) => {
      if (motion.matches || !intersecting || document.hidden || event.pointerType === 'touch') return;
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      coordinates = {
        x: Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)),
        y: Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)),
      };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!coordinates) return;
        element.style.setProperty('--signal-x', coordinates.x.toFixed(3));
        element.style.setProperty('--signal-y', coordinates.y.toFixed(3));
      });
    };
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', reset, { passive: true });
    document.addEventListener('visibilitychange', updateActivity);
    motion.addEventListener('change', updateActivity);
    return () => {
      observer.disconnect();
      reset();
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
      document.removeEventListener('visibilitychange', updateActivity);
      motion.removeEventListener('change', updateActivity);
    };
  }, []);
  return <div ref={root} className={`signal-sculpture${className ? ` ${className}` : ''}`} data-awake="false" aria-hidden="true">
    <div className="signal-sculpture__depth">
      <img className="signal-sculpture__image" src="/images/intelligence-aperture-1536.webp"
        srcSet="/images/intelligence-aperture-768.webp 768w, /images/intelligence-aperture-1536.webp 1536w"
        sizes="(max-width: 720px) 100vw, (max-width: 1100px) 90vw, 65vw"
        width={1536} height={1024} alt="" decoding="async" draggable={false}
        loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'}/>
    </div>
    <div className="signal-sculpture__light"/>
  </div>;
}
