import Foundation
import UIKit

enum APIError: LocalizedError {
    case invalidURL
    case encodingFailed
    case serverError(statusCode: Int)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Invalid URL"
        case .encodingFailed: "Failed to encode health data"
        case .serverError(let code): "Server returned status \(code)"
        case .networkError(let error): "Network error: \(error.localizedDescription)"
        }
    }
}

/// Wraps HealthDataPayload + device identifier + user handle for the server
private struct UploadBody: Encodable {
    let deviceId: String
    let userHandle: String
    let exportDate: Date
    let steps: [StepData]
    let heartRates: [HeartRateData]
    let sleepSamples: [SleepData]
    let activeEnergy: [ActiveEnergyData]
    let distances: [DistanceData]
    let workouts: [WorkoutData]
    let weights: [WeightData]
    let heights: [HeightData]
    let healthEvents: [HealthEvent]

    init(payload: HealthDataPayload, deviceId: String, userHandle: String) {
        self.deviceId = deviceId
        self.userHandle = userHandle
        self.exportDate = payload.exportDate
        self.steps = payload.steps
        self.heartRates = payload.heartRates
        self.sleepSamples = payload.sleepSamples
        self.activeEnergy = payload.activeEnergy
        self.distances = payload.distances
        self.workouts = payload.workouts
        self.weights = payload.weights
        self.heights = payload.heights
        self.healthEvents = payload.healthEvents
    }
}

/// Response from the health-data upload endpoint
struct UploadResponse: Decodable {
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

struct APIService {
    // ── Configuration ──────────────────────────────────────────────────
    // To test against local dev server, change to: "http://localhost:3000/api"
    static var baseURL = "https://treehacks2026-nine.vercel.app/api"

    /// The agent handle to associate this device's data with
    static var userHandle = "pari"

    /// Upload a HealthKit payload to the server. Returns the parsed response
    /// containing the upload ID and any anomaly results.
    @discardableResult
    static func uploadHealthData(_ payload: HealthDataPayload) async throws -> UploadResponse {
        guard let url = URL(string: baseURL)?.appendingPathComponent("health-data") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let deviceId = await UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let body = UploadBody(payload: payload, deviceId: deviceId, userHandle: userHandle)

        do {
            request.httpBody = try encoder.encode(body)
        } catch {
            throw APIError.encodingFailed
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        if let httpResponse = response as? HTTPURLResponse,
           !(200...299).contains(httpResponse.statusCode) {
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        do {
            return try decoder.decode(UploadResponse.self, from: data)
        } catch {
            // If we can't parse the response but got 2xx, treat as success
            return UploadResponse(uploadId: nil, status: "ok", warning: nil, anomaly: nil)
        }
    }
}
