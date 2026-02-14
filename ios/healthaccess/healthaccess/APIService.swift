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

struct APIService {
    // TODO: Replace with your deployed URL (e.g. https://your-app.vercel.app)
    static var baseURL = "http://localhost:3001/api"

    /// The agent handle to associate this device's data with
    static var userHandle = "pari"

    static func uploadHealthData(_ payload: HealthDataPayload) async throws {
        guard let url = URL(string: baseURL)?.appendingPathComponent("health-data") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let deviceId = await UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
        let body = UploadBody(payload: payload, deviceId: deviceId, userHandle: userHandle)

        do {
            request.httpBody = try encoder.encode(body)
        } catch {
            throw APIError.encodingFailed
        }

        let (_, response): (Data, URLResponse)
        do {
            (_, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        if let httpResponse = response as? HTTPURLResponse,
           !(200...299).contains(httpResponse.statusCode) {
            throw APIError.serverError(statusCode: httpResponse.statusCode)
        }
    }
}
