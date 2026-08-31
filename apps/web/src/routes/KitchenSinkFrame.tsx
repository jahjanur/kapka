import { Container } from '../components';
import { Gallery } from './Gallery';

/**
 * The gallery with no page chrome, for embedding in a ViewportFrame. Kept as
 * its own route so the frame renders at a true viewport width rather than an
 * approximation of one.
 */
export default function KitchenSinkFrame() {
  return (
    <>
      <Container>
        <Gallery frameMode />
      </Container>
    </>
  );
}
