import { AppRoutes } from "./router/routes";
import { UserRuntimeEffects } from "./UserRuntimeEffects";

export default function App() {
  return (
    <>
      <UserRuntimeEffects />
      <AppRoutes />
    </>
  );
}
