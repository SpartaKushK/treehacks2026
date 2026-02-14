import Foundation
import HealthKit
import Observation

@Observable
final class HealthKitManager {
    var isAuthorized = false
    var isLoading = false

    var steps: [StepData] = []
    var heartRates: [HeartRateData] = []
    var sleepSamples: [SleepData] = []
    var activeEnergy: [ActiveEnergyData] = []
    var distances: [DistanceData] = []
    var workouts: [WorkoutData] = []
    var weights: [WeightData] = []
    var heights: [HeightData] = []
    var healthEvents: [HealthEvent] = []

    private let healthStore = HKHealthStore()
    private let eventService: HealthEventService

    init() {
        eventService = HealthEventService(healthStore: healthStore)
    }

    private var readTypes: Set<HKObjectType> {
        var types: [HKObjectType] = [
            HKQuantityType(.stepCount),
            HKQuantityType(.heartRate),
            HKCategoryType(.sleepAnalysis),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKWorkoutType.workoutType(),
            HKQuantityType(.bodyMass),
            HKQuantityType(.height),
        ]
        types.append(contentsOf: eventService.objectTypes)
        return Set(types)
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
        } catch {
            print("HealthKit authorization failed: \(error)")
        }
    }

    func fetchAllData(daysBack: Int = 7) async {
        isLoading = true
        defer { isLoading = false }

        let now = Date()
        guard let startDate = Calendar.current.date(byAdding: .day, value: -daysBack, to: now) else { return }

        async let fetchedSteps = fetchSteps(start: startDate, end: now)
        async let fetchedHeartRates = fetchHeartRates(start: startDate, end: now)
        async let fetchedSleep = fetchSleep(start: startDate, end: now)
        async let fetchedActiveEnergy = fetchActiveEnergy(start: startDate, end: now)
        async let fetchedDistances = fetchDistances(start: startDate, end: now)
        async let fetchedWorkouts = fetchWorkouts(start: startDate, end: now)
        async let fetchedWeights = fetchWeights(start: startDate, end: now)
        async let fetchedHeights = fetchHeights(start: startDate, end: now)
        async let fetchedHealthEvents = eventService.fetchAllEvents(start: startDate, end: now)

        steps = await fetchedSteps
        heartRates = await fetchedHeartRates
        sleepSamples = await fetchedSleep
        activeEnergy = await fetchedActiveEnergy
        distances = await fetchedDistances
        workouts = await fetchedWorkouts
        weights = await fetchedWeights
        heights = await fetchedHeights
        healthEvents = await fetchedHealthEvents
    }

    func buildPayload() -> HealthDataPayload {
        HealthDataPayload(
            exportDate: Date(),
            steps: steps,
            heartRates: heartRates,
            sleepSamples: sleepSamples,
            activeEnergy: activeEnergy,
            distances: distances,
            workouts: workouts,
            weights: weights,
            heights: heights,
            healthEvents: healthEvents
        )
    }

    // MARK: - Individual Fetch Methods

    nonisolated private func fetchSteps(start: Date, end: Date) async -> [StepData] {
        await fetchDailyStatistics(
            type: HKQuantityType(.stepCount),
            unit: .count(),
            start: start,
            end: end
        ) { date, value in
            StepData(date: date, stepCount: value)
        }
    }

    nonisolated private func fetchActiveEnergy(start: Date, end: Date) async -> [ActiveEnergyData] {
        await fetchDailyStatistics(
            type: HKQuantityType(.activeEnergyBurned),
            unit: .kilocalorie(),
            start: start,
            end: end
        ) { date, value in
            ActiveEnergyData(date: date, kilocalories: value)
        }
    }

    nonisolated private func fetchDistances(start: Date, end: Date) async -> [DistanceData] {
        await fetchDailyStatistics(
            type: HKQuantityType(.distanceWalkingRunning),
            unit: .meter(),
            start: start,
            end: end
        ) { date, value in
            DistanceData(date: date, distanceMeters: value)
        }
    }

    nonisolated private func fetchDailyStatistics<T: Sendable>(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        transform: @escaping @Sendable (Date, Double) -> T
    ) async -> [T] {
        await withCheckedContinuation { continuation in
            let interval = DateComponents(day: 1)
            let startOfDay = Calendar.current.startOfDay(for: start)
            let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: end, options: .strictStartDate)

            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum,
                anchorDate: startOfDay,
                intervalComponents: interval
            )

            query.initialResultsHandler = { _, results, error in
                guard let results, error == nil else {
                    continuation.resume(returning: [])
                    return
                }
                var data: [T] = []
                results.enumerateStatistics(from: startOfDay, to: end) { statistics, _ in
                    if let sum = statistics.sumQuantity() {
                        let value = sum.doubleValue(for: unit)
                        data.append(transform(statistics.startDate, value))
                    }
                }
                continuation.resume(returning: data)
            }

            healthStore.execute(query)
        }
    }

    nonisolated private func fetchHeartRates(start: Date, end: Date) async -> [HeartRateData] {
        let samples = await fetchSamples(type: HKQuantityType(.heartRate), start: start, end: end)
        return samples.compactMap { sample in
            guard let quantitySample = sample as? HKQuantitySample else { return nil }
            let bpm = quantitySample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            return HeartRateData(startDate: quantitySample.startDate, endDate: quantitySample.endDate, bpm: bpm)
        }
    }

    nonisolated private func fetchSleep(start: Date, end: Date) async -> [SleepData] {
        let samples = await fetchSamples(type: HKCategoryType(.sleepAnalysis), start: start, end: end)
        return samples.compactMap { sample in
            guard let categorySample = sample as? HKCategorySample else { return nil }
            let stage: String = switch HKCategoryValueSleepAnalysis(rawValue: categorySample.value) {
            case .inBed: "inBed"
            case .asleepUnspecified: "asleep"
            case .asleepCore: "core"
            case .asleepDeep: "deep"
            case .asleepREM: "rem"
            case .awake: "awake"
            default: "unknown"
            }
            return SleepData(startDate: categorySample.startDate, endDate: categorySample.endDate, sleepStage: stage)
        }
    }

    nonisolated private func fetchWorkouts(start: Date, end: Date) async -> [WorkoutData] {
        let samples = await fetchSamples(type: HKWorkoutType.workoutType(), start: start, end: end)
        return samples.compactMap { sample in
            guard let workout = sample as? HKWorkout else { return nil }
            return WorkoutData(
                startDate: workout.startDate,
                endDate: workout.endDate,
                activityType: String(describing: workout.workoutActivityType.rawValue),
                durationSeconds: workout.duration,
                totalEnergyKcal: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                totalDistanceMeters: workout.totalDistance?.doubleValue(for: .meter())
            )
        }
    }

    nonisolated private func fetchWeights(start: Date, end: Date) async -> [WeightData] {
        let samples = await fetchSamples(type: HKQuantityType(.bodyMass), start: start, end: end)
        return samples.compactMap { sample in
            guard let quantitySample = sample as? HKQuantitySample else { return nil }
            let kg = quantitySample.quantity.doubleValue(for: .gramUnit(with: .kilo))
            return WeightData(date: quantitySample.startDate, weightKg: kg)
        }
    }

    nonisolated private func fetchHeights(start: Date, end: Date) async -> [HeightData] {
        let samples = await fetchSamples(type: HKQuantityType(.height), start: start, end: end)
        return samples.compactMap { sample in
            guard let quantitySample = sample as? HKQuantitySample else { return nil }
            let cm = quantitySample.quantity.doubleValue(for: .meterUnit(with: .centi))
            return HeightData(date: quantitySample.startDate, heightCm: cm)
        }
    }

    nonisolated private func fetchSamples(type: HKSampleType, start: Date, end: Date, limit: Int = HKObjectQueryNoLimit) async -> [HKSample] {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: limit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                guard let samples, error == nil else {
                    continuation.resume(returning: [])
                    return
                }
                continuation.resume(returning: samples)
            }

            healthStore.execute(query)
        }
    }
}
