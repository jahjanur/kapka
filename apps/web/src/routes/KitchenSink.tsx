import { Container, Stack, ThemeToggle } from '../components';
import { ViewportFrame } from '../components/ViewportFrame/ViewportFrame';
import { Gallery } from './Gallery';
import styles from './KitchenSink.module.css';

/**
 * The component gallery (§8 ground rule 2): every variant, in both themes, at
 * 360px and 1280px side by side. Storybook would do this too — this route is
 * the same guarantee without the build-tooling overhead.
 */
export default function KitchenSink() {
  return (
    <>
      <div className={styles.page}>
        <div className={styles.header}>
          <Container>
            <Stack gap={3}>
              <div>
                <p className={styles.eyebrow}>Kapka design system</p>
                <h1>Kitchen sink</h1>
              </div>
              <p className={styles.note}>
                Every component and every token, in both themes. Change something here and
                the regression shows up in a specimen before it reaches a screen.
              </p>
              <ThemeToggle />
            </Stack>
          </Container>
        </div>

        <Container>
          <Stack gap={16}>
            <section aria-labelledby="frames-heading">
              <div className={styles.sectionHead}>
                <h2 id="frames-heading">On a phone, in both themes</h2>
                <p className={styles.note}>
                  Real iframes at a real width, at 1:1, so media queries behave the way
                  they will on the device — one pinned to each theme, so a dark-mode
                  regression is visible without switching. You are already looking at the
                  desktop view.
                </p>
              </div>
              <ViewportFrame src="/kitchen-sink/frame" />
            </section>

            <Gallery />
          </Stack>
        </Container>
      </div>
    </>
  );
}
