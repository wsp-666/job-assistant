import QuickStartGuide from "../components/QuickStartGuide";

export default function QuickStartPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">快速上手</h2>
        <p className="text-slate-500">了解产品功能后，按下方步骤完成配置与使用</p>
      </div>
      <QuickStartGuide />
    </div>
  );
}
