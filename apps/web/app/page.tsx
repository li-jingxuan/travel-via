import { Suspense } from "react";
import HomePageClient from "./HomePageClient";

export default function HomePage() {
  // useSearchParams 依赖客户端导航状态；用 Suspense 包裹后可避免 Next 16 构建报错。
  return (
    <Suspense fallback={null}>
      <HomePageClient />
    </Suspense>
  );
}
