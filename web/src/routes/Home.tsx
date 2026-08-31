import { Link } from 'react-router-dom';
import { Card, Container, IconSprite, Stack, ThemeToggle } from '../components';

/**
 * PLACEHOLDER — not the landing screen.
 *
 * The real landing / public feed is §9.1 and is not built yet. This exists so
 * `/` is not a blank route while the design system lands first.
 */
export default function Home() {
  return (
    <>
      <IconSprite />
      <Container width="text" style={{ paddingBlock: 'var(--space-section)' }}>
        <Stack gap={6}>
          <Stack gap={3}>
            <h1>Kapka</h1>
            <p>
              Urgent blood donation matching. The design system is in place; the
              screens in §9 of the plan are still to come.
            </p>
          </Stack>
          <ThemeToggle />
          <Card>
            <Stack gap={2}>
              <h2>Design system</h2>
              <p>
                Every token and every Tier&nbsp;1 component, in both themes, at
                360px and 1280px.
              </p>
              <p><Link to="/kitchen-sink">Open the kitchen sink →</Link></p>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </>
  );
}
