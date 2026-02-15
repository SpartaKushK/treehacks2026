import Foundation

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

struct APIService {
    static var baseURL = "https://api.example.com"

    static func uploadHealthData(_ payload: HealthDataPayload) async throws {
        guard let url = URL(string: baseURL)?.appendingPathComponent("health-data") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        do {
            request.httpBody = try encoder.encode(payload)
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
