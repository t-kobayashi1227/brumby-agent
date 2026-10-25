import ResearchSteps from "../../_components/ResearchSteps";

/** Competitor-research flow: every step shows the step indicator on top. */
export default function ResearchLayout({ children }: LayoutProps<"/research">) {
  return (
    <>
      <ResearchSteps />
      {children}
    </>
  );
}
