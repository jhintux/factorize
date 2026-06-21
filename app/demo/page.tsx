import { DemoPage } from "@/app/components/DemoPage";
import {
  ensureDemoSmesSeeded,
  getDemoPageData,
} from "@/app/actions/demo";

export default async function Page() {
  await ensureDemoSmesSeeded();
  const data = await getDemoPageData();

  return <DemoPage initialData={data} />;
}
