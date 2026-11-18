import Foundation

/// A source of numbers in 0..<1. Seeded sources repeat the web game's sequence exactly
/// (FNV-1a hash into mulberry32), so the daily expedition picks the same countries on both.
nonisolated final class Rand {
    private var state: UInt32?

    /// System randomness.
    init() { state = nil }

    init(seed: UInt32) { state = seed }

    convenience init(seedString: String) {
        self.init(seed: Rand.hash(seedString))
    }

    static func hash(_ string: String) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for unit in string.utf16 {
            h ^= UInt32(unit)
            h = h &* 16_777_619
        }
        return h
    }

    func unit() -> Double {
        guard var a = state else { return Double.random(in: 0..<1) }
        a = a &+ 0x6d2b_79f5
        state = a
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }

    func int(below n: Int) -> Int {
        min(n - 1, Int(unit() * Double(n)))
    }

    func shuffled<T>(_ list: [T]) -> [T] {
        var a = list
        guard a.count > 1 else { return a }
        for i in stride(from: a.count - 1, to: 0, by: -1) {
            a.swapAt(i, int(below: i + 1))
        }
        return a
    }

    func pick<T>(_ list: [T]) -> T? {
        list.isEmpty ? nil : list[int(below: list.count)]
    }

    func pickWeighted<T>(_ list: [T], weights: [Double]) -> T? {
        let total = weights.reduce(0, +)
        guard total > 0 else { return pick(list) }
        var r = unit() * total
        for (item, weight) in zip(list, weights) {
            r -= weight
            if r <= 0 { return item }
        }
        return list.last
    }
}
