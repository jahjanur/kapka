import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Puts a new screen at the top.
 *
 * A single-page app keeps the scroll position across a navigation, so tapping
 * a request from halfway down the feed opens its detail page already scrolled
 * past the heading. Nothing errors; the page just looks broken.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
