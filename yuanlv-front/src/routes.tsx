import { Suspense, lazy, type ComponentType } from "react";
import { Navigate, Outlet, createBrowserRouter } from "react-router";
import { useAuth } from "./context/AuthContext";

const Layout = lazy(() => import("./components/Layout").then((module) => ({ default: module.Layout })));
const Auth = lazy(() => import("./views/Auth").then((module) => ({ default: module.Auth })));
const Journey = lazy(() => import("./views/Journey").then((module) => ({ default: module.Journey })));
const Community = lazy(() => import("./views/Community").then((module) => ({ default: module.Community })));
const Memory = lazy(() => import("./views/Memory").then((module) => ({ default: module.Memory })));
const MemoryBottles = lazy(() =>
  import("./views/MemoryBottles").then((module) => ({ default: module.MemoryBottles }))
);
const MemoryCapsules = lazy(() =>
  import("./views/MemoryCapsules").then((module) => ({ default: module.MemoryCapsules }))
);
const Onboarding = lazy(() =>
  import("./views/Onboarding").then((module) => ({ default: module.Onboarding }))
);
const TravelDetail = lazy(() =>
  import("./views/TravelDetail").then((module) => ({ default: module.TravelDetail }))
);

function RoutePending() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f4ee] px-6 text-center text-sm text-stone-500">
      正在整理这一页…
    </div>
  );
}

function withSuspense<T extends ComponentType<any>>(Component: T) {
  return function SuspendedRoute() {
    return (
      <Suspense fallback={<RoutePending />}>
        <Component />
      </Suspense>
    );
  };
}

const LayoutRoute = withSuspense(Layout);
const AuthRoute = withSuspense(Auth);
const JourneyRoute = withSuspense(Journey);
const CommunityRoute = withSuspense(Community);
const MemoryRoute = withSuspense(Memory);
const MemoryBottlesRoute = withSuspense(MemoryBottles);
const MemoryCapsulesRoute = withSuspense(MemoryCapsules);
const OnboardingRouteView = withSuspense(Onboarding);
const TravelDetailRoute = withSuspense(TravelDetail);

function GuestRoute() {
  const { isAuthenticated, needsOnboarding, isHydrating } = useAuth();

  if (isHydrating) return <RoutePending />;

  if (isAuthenticated && needsOnboarding) return <Navigate to="/welcome" replace />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <AuthRoute />;
}

function OnboardingRoute() {
  const { isAuthenticated, needsOnboarding, isHydrating } = useAuth();

  if (isHydrating) return <RoutePending />;

  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (!needsOnboarding) return <Navigate to="/" replace />;
  return <OnboardingRouteView />;
}

function ProtectedRoute() {
  const { isAuthenticated, needsOnboarding, isHydrating } = useAuth();

  if (isHydrating) return <RoutePending />;

  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (needsOnboarding) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: "/auth", Component: GuestRoute },
  { path: "/welcome", Component: OnboardingRoute },
  {
    Component: ProtectedRoute,
    children: [
      {
        path: "/",
        Component: LayoutRoute,
        children: [
          { index: true, Component: JourneyRoute },
          { path: "community", Component: CommunityRoute },
          { path: "memory", Component: MemoryRoute },
          { path: "memory/capsules", Component: MemoryCapsulesRoute },
          { path: "memory/bottles", Component: MemoryBottlesRoute },
          { path: "travel/:travelId", Component: TravelDetailRoute },
        ],
      },
    ],
  },
]);
