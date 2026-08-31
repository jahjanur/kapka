import { Container, IconSprite, Stack, ThemeToggle } from '../components';
import { ViewportFrames } from '../components/ViewportFrame/ViewportFrame';
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
      <IconSprite />
      <div className={styles.page}>
        <div className={styles.header}>
          <Container>
            <Stack gap={3}>
              <div>
                <p className={styles.eyebrow}>Kapka design system</p>
                <h1>Kitchen sink</h1>
              </div>
              <p className={styles.note}>
                Every Tier&nbsp;1 component and every token. Switch the theme and
                re-read the page — dark is built alongside light, not bolted on
                afterwards.
              </p>
              <ThemeToggle />
            </Stack>
          </Container>
        </div>

        <Container>
          <Stack gap={16}>
            <section aria-labelledby="frames-heading">
              <div className={styles.sectionHead}>
                <h2 id="frames-heading">At 360px and 1280px</h2>
                <p className={styles.note}>
                  Real iframes at real widths, so media queries behave the way
                  they will on the device. 360px is the floor: anything that
                  scrolls sideways in the left-hand frame is a bug.
                </p>
              </div>
              <ViewportFrames src="/kitchen-sink/frame" />
            </section>

            <Gallery />
          </Stack>
        </Container>
      </div>
    </>
  );
}
