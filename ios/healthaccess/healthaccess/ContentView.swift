import SwiftUI

// MARK: - CareSync Design Tokens (matching web globals.css)

enum CareSync {
    static let bg = Color(red: 1.0, green: 0.973, blue: 0.941)           // #FFF8F0
    static let card = Color(red: 1.0, green: 0.992, blue: 0.976)         // #FFFDF9
    static let border = Color(red: 0.961, green: 0.929, blue: 0.890)     // #F5EDE3
    static let accent = Color(red: 0.102, green: 0.478, blue: 0.427)     // #1A7A6D
    static let coral = Color(red: 0.910, green: 0.451, blue: 0.290)      // #E8734A
    static let coralDark = Color(red: 0.831, green: 0.380, blue: 0.227)  // #D4613A
    static let text = Color(red: 0.176, green: 0.165, blue: 0.149)       // #2D2A26
    static let textDim = Color(red: 0.239, green: 0.220, blue: 0.200)    // #3D3833
    static let badgeGreenBg = Color(red: 0.902, green: 0.961, blue: 0.949) // #E6F5F2
    static let badgeRedBg = Color(red: 0.992, green: 0.925, blue: 0.922)   // #FDECEB
    static let red = Color(red: 0.753, green: 0.224, blue: 0.169)          // #C0392B
}

// MARK: - Content View

struct ContentView: View {
    @State private var manager = HealthKitManager()
    @State private var uploadStatus: String?
    @State private var demoStatus: String?
    @State private var isDemoLoading = false
    @State private var syncState: SyncState = .idle

    enum SyncState {
        case idle, authorizing, fetching, uploading, done, error(String)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                headerSection
                statusSection
                metricsGrid
                healthEventsSection
                uploadSection
                demoSection
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .background(CareSync.bg.ignoresSafeArea())
        .task {
            await autoSync()
        }
    }

    // MARK: - Auto Sync

    private func autoSync() async {
        syncState = .authorizing
        await manager.requestAuthorization()

        guard manager.isAuthorized else {
            syncState = .error("Not authorized")
            return
        }

        syncState = .fetching
        await manager.fetchAllData()

        if hasAnyData {
            syncState = .uploading
            await uploadData()
        }

        if case .error = syncState { return }
        syncState = .done
    }

    // MARK: - Header

    private var headerSection: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 10)
                .fill(CareSync.accent)
                .frame(width: 40, height: 40)
                .overlay(
                    Text("C")
                        .font(.system(size: 20, weight: .bold, design: .serif))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text("CareSync")
                    .font(.system(size: 22, weight: .bold, design: .serif))
                    .foregroundStyle(CareSync.accent)
                Text("HEALTH MONITOR")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1)
                    .foregroundStyle(CareSync.textDim)
            }

            Spacer()
        }
        .padding(.top, 8)
    }

    // MARK: - Status

    private var statusSection: some View {
        CardView {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    StatusBadge(
                        label: manager.isAuthorized ? "Authorized" : "Not Authorized",
                        color: manager.isAuthorized ? CareSync.accent : CareSync.red,
                        bgColor: manager.isAuthorized ? CareSync.badgeGreenBg : CareSync.badgeRedBg
                    )

                    StatusBadge(
                        label: syncStateLabel,
                        color: syncStateColor,
                        bgColor: syncStateBgColor
                    )

                    Spacer()

                    if manager.isLoading || isSyncing {
                        ProgressView()
                            .tint(CareSync.accent)
                    }
                }

                if !manager.isAuthorized {
                    Button {
                        Task { await manager.requestAuthorization() }
                    } label: {
                        Text("Request Authorization")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(CareSync.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }

                Button {
                    Task { await autoSync() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.clockwise")
                        Text("Sync Now")
                    }
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(CareSync.accent)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(CareSync.badgeGreenBg)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(isSyncing || !manager.isAuthorized)
                .opacity(isSyncing ? 0.5 : 1)
            }
        }
    }

    // MARK: - Metrics Grid

    private var metricsGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Health Data")

            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ], spacing: 12) {
                MetricCard(icon: "figure.walk", label: "Steps", count: manager.steps.count, color: CareSync.accent)
                MetricCard(icon: "heart.fill", label: "Heart Rate", count: manager.heartRates.count, color: CareSync.red)
                MetricCard(icon: "bed.double.fill", label: "Sleep", count: manager.sleepSamples.count, color: .indigo)
                MetricCard(icon: "flame.fill", label: "Active Energy", count: manager.activeEnergy.count, color: CareSync.coral)
                MetricCard(icon: "figure.run", label: "Distance", count: manager.distances.count, color: CareSync.accent)
                MetricCard(icon: "dumbbell.fill", label: "Workouts", count: manager.workouts.count, color: .purple)
                MetricCard(icon: "scalemass.fill", label: "Weight", count: manager.weights.count, color: CareSync.textDim)
                MetricCard(icon: "ruler.fill", label: "Height", count: manager.heights.count, color: CareSync.textDim)
            }
        }
    }

    // MARK: - Health Events

    private var healthEventsSection: some View {
        let events = HealthEventType.all

        return VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Health Events")

            CardView {
                VStack(spacing: 0) {
                    ForEach(Array(events.enumerated()), id: \.element.identifierRawValue) { index, eventType in
                        let count = manager.healthEvents.filter { $0.eventType == eventType.identifierRawValue }.count
                        HStack {
                            Image(systemName: eventType.icon)
                                .frame(width: 24)
                                .foregroundStyle(count > 0 ? CareSync.red : CareSync.textDim)
                            Text(eventType.displayName)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(CareSync.text)
                            Spacer()
                            Text("\(count)")
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .foregroundStyle(count > 0 ? CareSync.red : CareSync.textDim)
                        }
                        .padding(.vertical, 10)

                        if index < events.count - 1 {
                            Divider()
                                .background(CareSync.border)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Upload

    private var uploadSection: some View {
        Group {
            if let uploadStatus {
                CardView {
                    HStack(spacing: 8) {
                        Image(systemName: uploadStatus.starts(with: "Error") ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(uploadStatus.starts(with: "Error") ? CareSync.red : CareSync.accent)
                        Text(uploadStatus)
                            .font(.system(size: 13))
                            .foregroundStyle(CareSync.textDim)
                        Spacer()
                    }
                }
            }
        }
    }

    // MARK: - Demo

    private var demoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Demo")

            Button {
                Task { await triggerDemoAlert() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("Trigger Demo Alert")
                        .font(.system(size: 15, weight: .bold))
                    Spacer()
                    if isDemoLoading {
                        ProgressView()
                            .tint(.white)
                    }
                }
                .foregroundStyle(.white)
                .frame(minHeight: 48)
                .padding(.horizontal, 16)
                .background(CareSync.coral)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: CareSync.coral.opacity(0.25), radius: 4, y: 2)
            }
            .disabled(isDemoLoading)
            .opacity(isDemoLoading ? 0.7 : 1)

            if let demoStatus {
                Text(demoStatus)
                    .font(.system(size: 13))
                    .foregroundStyle(CareSync.textDim)
                    .padding(.horizontal, 4)
            }

            Text("Sends synthetic bad health data (low sleep, high HR, irregular rhythm) to trigger the anomaly pipeline.")
                .font(.system(size: 12))
                .foregroundStyle(CareSync.textDim.opacity(0.7))
                .padding(.horizontal, 4)
        }
    }

    // MARK: - Helpers

    private var hasAnyData: Bool {
        !manager.steps.isEmpty || !manager.heartRates.isEmpty || !manager.sleepSamples.isEmpty ||
        !manager.activeEnergy.isEmpty || !manager.distances.isEmpty || !manager.workouts.isEmpty ||
        !manager.weights.isEmpty || !manager.heights.isEmpty || !manager.healthEvents.isEmpty
    }

    private var isSyncing: Bool {
        switch syncState {
        case .authorizing, .fetching, .uploading: return true
        default: return false
        }
    }

    private var syncStateLabel: String {
        switch syncState {
        case .idle: return "Idle"
        case .authorizing: return "Authorizing..."
        case .fetching: return "Fetching..."
        case .uploading: return "Uploading..."
        case .done: return "Synced"
        case .error(let msg): return msg
        }
    }

    private var syncStateColor: Color {
        switch syncState {
        case .done: return CareSync.accent
        case .error: return CareSync.red
        default: return Color(red: 0.710, green: 0.565, blue: 0.263) // #B5902A yellow
        }
    }

    private var syncStateBgColor: Color {
        switch syncState {
        case .done: return CareSync.badgeGreenBg
        case .error: return CareSync.badgeRedBg
        default: return Color(red: 1.0, green: 0.973, blue: 0.906) // #FFF8E7 yellow bg
        }
    }

    private func triggerDemoAlert() async {
        isDemoLoading = true
        demoStatus = "Sending synthetic alert..."
        do {
            let result = try await APIService.triggerDemoAlert()
            if let anomaly = result.anomaly, let score = anomaly.score {
                let flags = anomaly.flags?.joined(separator: ", ") ?? "none"
                let triggered = anomaly.pipelineTriggered == true ? "pipeline triggered" : "below threshold"
                demoStatus = "Score: \(Int(score)) | \(flags) | \(triggered)"
            } else {
                demoStatus = "Alert sent (no anomaly data returned)"
            }
        } catch {
            demoStatus = "Error: \(error.localizedDescription)"
        }
        isDemoLoading = false
    }

    private func uploadData() async {
        uploadStatus = "Uploading..."
        let payload = manager.buildPayload()
        do {
            let result = try await APIService.uploadHealthData(payload)
            if let warning = result.warning {
                uploadStatus = "Partial upload: \(warning)"
            } else if let anomaly = result.anomaly,
                      let score = anomaly.score, score > 0 {
                let flags = anomaly.flags?.joined(separator: ", ") ?? "none"
                uploadStatus = "Uploaded — anomaly score \(Int(score)), flags: \(flags)"
            } else {
                uploadStatus = "Upload successful!"
            }
        } catch {
            uploadStatus = "Error: \(error.localizedDescription)"
            syncState = .error("Upload failed")
        }
    }
}

// MARK: - Reusable Components

private struct CardView<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .padding(16)
            .background(CareSync.card)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(CareSync.border, lineWidth: 2)
            )
    }
}

private struct StatusBadge: View {
    let label: String
    let color: Color
    let bgColor: Color

    var body: some View {
        Text(label.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.5)
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(bgColor)
            .clipShape(Capsule())
    }
}

private struct SectionHeader: View {
    let title: String

    var body: some View {
        HStack(spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 13, weight: .bold, design: .serif))
                .tracking(1.5)
                .foregroundStyle(CareSync.accent)

            Rectangle()
                .fill(CareSync.border)
                .frame(height: 1)
        }
        .padding(.top, 8)
    }
}

private struct MetricCard: View {
    let icon: String
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(color)

            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(CareSync.text)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Text("\(count)")
                .font(.system(size: 24, weight: .bold, design: .serif))
                .foregroundStyle(CareSync.accent)

            Text("records")
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.5)
                .foregroundStyle(CareSync.textDim)
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity, minHeight: 120)
        .padding(12)
        .background(CareSync.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(CareSync.border, lineWidth: 2)
        )
    }
}

#Preview {
    ContentView()
}
