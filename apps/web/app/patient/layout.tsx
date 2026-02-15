import PatientNav from "./components/PatientNav";

export const metadata = {
  title: "Health Assistant — Your Personal Care Helper",
  description: "Making healthcare simple and easy for you.",
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
