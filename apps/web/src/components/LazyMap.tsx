import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from './ui';

// مكتبة الخرايط تقيلة شوية، فبتتحمل بس لما شاشة فيها خريطة تفتح
const MapView = lazy(() => import('./MapView'));

export function LazyMap(props: ComponentProps<typeof MapView>) {
  return (
    <Suspense fallback={<Skeleton className={props.className ?? 'h-72'} />}>
      <MapView {...props} />
    </Suspense>
  );
}
export type { MapMarker } from './MapView';
