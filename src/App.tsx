import { GuestApp } from './ui/GuestApp';
import { Home } from './ui/Home';
import { useRoute } from './ui/router';

export function App() {
  const route = useRoute();
  if (route.name === 'join') return <GuestApp key={route.code} code={route.code} />;
  return <Home />;
}
