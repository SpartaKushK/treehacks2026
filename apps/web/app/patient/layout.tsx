import PatientNav from "./components/PatientNav";

export const metadata = {
  title: "CareSync — Health Management Made Simple",
  description: "We manage your health, so you don't have to.",
};

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="patient-shell">
      <PatientNav />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
        {children}
      </main>
    </div>
  );
}
