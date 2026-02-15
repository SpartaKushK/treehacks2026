import Foundation
import WatchKit

// MARK: - Models (self-contained for Watch target)

private struct StepData: Encodable {
    let date: Date
    let stepCount: Double
}

private struct HeartRateData: Encodable {
    let startDate: Date
    let endDate: Date
    let bpm: Double
}

private struct SleepData: Encodable {
    let startDate: Date
    let endDate: Date
    let sleepStage: String
}

private struct ActiveEnergyData: Encodable {
    let date: Date
    let kilocalories: Double
}

private struct DistanceData: Encodable {
    let date: Date
    let distanceMeters: Double
}

private struct HealthEventData: Encodable {
    let eventType: String
    let startDate: Date
    let endDate: Date
}

private struct UploadBody: Encodable {
    let deviceId: String
    let userHandle: String
    let exportDate: Date
    let steps: [StepData]
    let heartRates: [HeartRateData]
    let sleepSamples: [SleepData]
    let activeEnergy: [ActiveEnergyData]
    let distances: [DistanceData]
    let workouts: [String]          // empty for demo
    let weights: [String]
    let heights: [String]
    let healthEvents: [HealthEventData]
}

struct DemoAlertResponse: Decodable {
    let uploadId: String?
    let status: String?
    let warning: String?
    let anomaly: AnomalyResult?

    struct AnomalyResult: Decodable {
        let score: Double?
        let flags: [String]?
        let pipelineTriggered: Bool?
        let traceId: String?
        let urgency: String?
    }
}

enum DemoAlertService {
    static let baseURL = "https://treehacks2026-nine.vercel.app/api"
    static let userHandle = "healthcarea"

    static func triggerAlert() async throws -> DemoAlertResponse {
        guard let url = URL(string: baseURL)?.appendingPathComponent("health-data") else {
            throw URLError(.badURL)
        }

        let now = Date()
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: now)!

        let body = UploadBody(
            deviceId: WKInterfaceDevice.current().identifierForVendor?.uuidString ?? UUID().uuidString,
            userHandle: userHandle,
            exportDate: now,
            steps: [StepData(date: yesterday, stepCount: 800)],
            heartRates: [
                HeartRateData(startDate: yesterday, endDate: yesterday, bpm: 105),
                HeartRateData(startDate: now, endDate: now, bpm: 98),
            ],
            sleepSamples: [
                SleepData(startDate: yesterday,
                          endDate: yesterday.addingTimeInterval(2.5 * 3600),
                          sleepStage: "core"),
            ],
            activeEnergy: [ActiveEnergyData(date: yesterday, kilocalories: 50)],
            distances: [DistanceData(date: yesterday, distanceMeters: 200)],
            workouts: [],
            weights: [],
            heights: [],
            healthEvents: [
                HealthEventData(eventType: "HKCategoryTypeIdentifierIrregularHeartRhythmEvent",
                                startDate: yesterday, endDate: yesterday),
                HealthEventData(eventType: "HKCategoryTypeIdentifierHighHeartRateEvent",
                                startDate: now, endDate: now),
            ]
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }

        return (try? JSONDecoder().decode(DemoAlertResponse.self, from: data))
            ?? DemoAlertResponse(uploadId: nil, status: "ok", warning: nil, anomaly: nil)
    }
}
