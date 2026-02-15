import Foundation
import HealthKit

struct HealthEventType: Sendable {
    let identifier: HKCategoryTypeIdentifier
    let displayName: String
    let icon: String

    var categoryType: HKCategoryType { HKCategoryType(identifier) }
    var identifierRawValue: String { identifier.rawValue }
}

extension HealthEventType {
    static let all: [HealthEventType] = [
        .irregularHeartRhythm,
        .highHeartRate,
        .lowHeartRate,
        .audioExposure,
    ]

    static let irregularHeartRhythm = HealthEventType(
        identifier: .irregularHeartRhythmEvent,
        displayName: "Irregular Rhythm",
        icon: "waveform.path.ecg"
    )
    static let highHeartRate = HealthEventType(
        identifier: .highHeartRateEvent,
        displayName: "High Heart Rate",
        icon: "heart.circle.fill"
    )
    static let lowHeartRate = HealthEventType(
        identifier: .lowHeartRateEvent,
        displayName: "Low Heart Rate",
        icon: "heart.slash.fill"
    )
    static let audioExposure = HealthEventType(
        identifier: .environmentalAudioExposureEvent,
        displayName: "Audio Exposure",
        icon: "ear.trianglebadge.exclamationmark"
    )
}

struct HealthEventService {
    private let healthStore: HKHealthStore

    init(healthStore: HKHealthStore) {
        self.healthStore = healthStore
    }

    var objectTypes: [HKObjectType] {
        HealthEventType.all.map(\.categoryType)
    }

    nonisolated func fetchAllEvents(start: Date, end: Date) async -> [HealthEvent] {
        await withTaskGroup(of: [HealthEvent].self) { group in
            for eventType in HealthEventType.all {
                group.addTask {
                    await self.fetchEvents(ofType: eventType, start: start, end: end)
                }
            }
            var results: [HealthEvent] = []
            for await batch in group {
                results.append(contentsOf: batch)
            }
            return results.sorted { $0.startDate < $1.startDate }
        }
    }

    nonisolated private func fetchEvents(ofType eventType: HealthEventType, start: Date, end: Date) async -> [HealthEvent] {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
            let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

            let query = HKSampleQuery(
                sampleType: eventType.categoryType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                guard let samples, error == nil else {
                    continuation.resume(returning: [])
                    return
                }
                let events = samples.map { sample in
                    HealthEvent(
                        eventType: eventType.identifier.rawValue,
                        startDate: sample.startDate,
                        endDate: sample.endDate
                    )
                }
                continuation.resume(returning: events)
            }

            healthStore.execute(query)
        }
    }
}
