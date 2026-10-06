import Sidebar from "../_components/Sidebar";
import Header from "../_components/Header";

/** Shell shared by every page after login: sidebar navigation + page header. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex-1 flex min-h-[640px]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-7 overflow-auto print:p-0 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
