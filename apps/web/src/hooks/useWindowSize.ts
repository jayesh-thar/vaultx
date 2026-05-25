import { useState, useEffect } from 'react';

interface WindowSize {
  width: number;
  isMobile: boolean; // < 768px
  isTablet: boolean; // 768–1023px
  isDesktop: boolean; // ≥ 1024px
}

export function useWindowSize(): WindowSize {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return {
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}
