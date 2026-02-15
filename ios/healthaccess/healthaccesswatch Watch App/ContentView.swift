import SwiftUI

struct ContentView: View {
    @State private var status: String?
    @State private var isLoading = false
    @State private var didTrigger = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.red)

                Text("CareSync")
                    .font(.headline)

                Button {
                    Task { await triggerAlert() }
                } label: {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "bolt.heart.fill")
                        }
                        Text(isLoading ? "Sending..." : "Trigger Alert")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .disabled(isLoading)

                if let status {
                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(didTrigger ? .green : .secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding()
        }
    }

    private func triggerAlert() async {
        isLoading = true
        didTrigger = false
        status = nil

        do {
            let result = try await DemoAlertService.triggerAlert()
            if let anomaly = result.anomaly, let score = anomaly.score {
                let triggered = anomaly.pipelineTriggered == true
                didTrigger = triggered
                let flags = anomaly.flags?.joined(separator: ", ") ?? "—"
                status = "Score: \(Int(score))\nFlags: \(flags)\n\(triggered ? "Pipeline triggered" : "Below threshold")"
            } else {
                didTrigger = true
                status = "Alert sent"
            }
        } catch {
            status = "Error: \(error.localizedDescription)"
        }

        isLoading = false

        // Haptic feedback on the wrist
        if didTrigger {
            WKInterfaceDevice.current().play(.success)
        } else {
            WKInterfaceDevice.current().play(.failure)
        }
    }
}

#Preview {
    ContentView()
}
