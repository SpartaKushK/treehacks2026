import SwiftUI

struct ContentView: View {
    @State private var manager = HealthKitManager()
    @State private var uploadStatus: String?

    var body: some View {
        NavigationStack {
            List {
                // MARK: - Authorization
                Section("Authorization") {
                    HStack {
                        Image(systemName: manager.isAuthorized ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundStyle(manager.isAuthorized ? .green : .red)
                        Text(manager.isAuthorized ? "Authorized" : "Not Authorized")
                    }
                    if !manager.isAuthorized {
                        Button("Request Authorization") {
                            Task { await manager.requestAuthorization() }
                        }
                    }
                }

                // MARK: - Fetch
                Section("Fetch Data") {
                    Button {
                        Task { await manager.fetchAllData() }
                    } label: {
                        HStack {
                            Text("Fetch Last 7 Days")
                            Spacer()
                            if manager.isLoading {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(manager.isLoading || !manager.isAuthorized)
                }

                // MARK: - Summary
                Section("Data Summary") {
                    SummaryRow(icon: "figure.walk", label: "Steps", count: manager.steps.count)
                    SummaryRow(icon: "heart.fill", label: "Heart Rate", count: manager.heartRates.count)
                    SummaryRow(icon: "bed.double.fill", label: "Sleep", count: manager.sleepSamples.count)
                    SummaryRow(icon: "flame.fill", label: "Active Energy", count: manager.activeEnergy.count)
                    SummaryRow(icon: "figure.run", label: "Distance", count: manager.distances.count)
                    SummaryRow(icon: "dumbbell.fill", label: "Workouts", count: manager.workouts.count)
                    SummaryRow(icon: "scalemass.fill", label: "Weight", count: manager.weights.count)
                    SummaryRow(icon: "ruler.fill", label: "Height", count: manager.heights.count)
                    ForEach(HealthEventType.all, id: \.identifierRawValue) { eventType in
                        let count = manager.healthEvents.filter { $0.eventType == eventType.identifierRawValue }.count
                        SummaryRow(icon: eventType.icon, label: eventType.displayName, count: count)
                    }
                }

                // MARK: - Upload
                Section("Upload") {
                    Button {
                        Task { await uploadData() }
                    } label: {
                        Text("Upload to Server")
                    }
                    .disabled(!hasAnyData)

                    if let uploadStatus {
                        Text(uploadStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("HealthAccess")
        }
    }

    private var hasAnyData: Bool {
        !manager.steps.isEmpty || !manager.heartRates.isEmpty || !manager.sleepSamples.isEmpty ||
        !manager.activeEnergy.isEmpty || !manager.distances.isEmpty || !manager.workouts.isEmpty ||
        !manager.weights.isEmpty || !manager.heights.isEmpty || !manager.healthEvents.isEmpty
    }

    private func uploadData() async {
        uploadStatus = "Uploading..."
        let payload = manager.buildPayload()
        do {
            try await APIService.uploadHealthData(payload)
            uploadStatus = "Upload successful!"
        } catch {
            uploadStatus = "Error: \(error.localizedDescription)"
        }
    }
}

private struct SummaryRow: View {
    let icon: String
    let label: String
    let count: Int

    var body: some View {
        HStack {
            Image(systemName: icon)
                .frame(width: 24)
                .foregroundStyle(.blue)
            Text(label)
            Spacer()
            Text("\(count) records")
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    ContentView()
}
