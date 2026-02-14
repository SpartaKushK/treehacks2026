import Foundation

struct StepData: Codable, Sendable {
    let date: Date
    let stepCount: Double
}

struct HeartRateData: Codable, Sendable {
    let startDate: Date
    let endDate: Date
    let bpm: Double
}

struct SleepData: Codable, Sendable {
    let startDate: Date
    let endDate: Date
    let sleepStage: String
}

struct ActiveEnergyData: Codable, Sendable {
    let date: Date
    let kilocalories: Double
}

struct DistanceData: Codable, Sendable {
    let date: Date
    let distanceMeters: Double
}

struct WorkoutData: Codable, Sendable {
    let startDate: Date
    let endDate: Date
    let activityType: String
    let durationSeconds: Double
    let totalEnergyKcal: Double?
    let totalDistanceMeters: Double?
}

struct WeightData: Codable, Sendable {
    let date: Date
    let weightKg: Double
}

struct HeightData: Codable, Sendable {
    let date: Date
    let heightCm: Double
}

struct HealthEvent: Codable, Sendable {
    let eventType: String
    let startDate: Date
    let endDate: Date
}

struct HealthDataPayload: Codable, Sendable {
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
}
