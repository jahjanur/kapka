import { AppHeader, Button, Container, EmptyState } from '../components';
import styles from './NotFound.module.css';

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <div className={styles.page}>
        <Container>
          <EmptyState
            icon="alertCircle"
            headline="There is nothing at this address"
            body="The link may be old, or mistyped. The open requests are all on the feed."
            action={<Button to="/">Back to requests</Button>}
          />
        </Container>
      </div>
    </>
  );
}
