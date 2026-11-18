import AVFoundation
import UIKit

/// Sound and haptics for answers. Sounds are synthesized, as on the web: no audio files ship.
final class Feedback {
    enum Cue: CaseIterable {
        case tap, correct, stamp, near, miss, finish, medal
    }

    var soundOn = true
    var hapticsOn = true

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var buffers: [Cue: AVAudioPCMBuffer] = [:]
    private var prepared = false
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)
    private let impact = UIImpactFeedbackGenerator(style: .light)
    private let notify = UINotificationFeedbackGenerator()

    func play(_ cue: Cue) {
        if hapticsOn {
            switch cue {
            case .tap: impact.impactOccurred(intensity: 0.6)
            case .correct, .stamp, .finish, .medal: notify.notificationOccurred(.success)
            case .near: notify.notificationOccurred(.warning)
            case .miss: notify.notificationOccurred(.error)
            }
        }
        guard soundOn, prepare(), let buffer = buffers[cue] else { return }
        player.scheduleBuffer(buffer, at: nil, options: .interrupts)
        if !player.isPlaying { player.play() }
    }

    /// Starts the audio engine on first use. Ambient, so it respects the silent switch and other audio.
    private func prepare() -> Bool {
        if prepared { return engine.isRunning || ((try? engine.start()) != nil) }
        guard let format else { return false }
        prepared = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = 0.5
        for cue in Cue.allCases { buffers[cue] = Self.render(cue, format: format) }
        return (try? engine.start()) != nil
    }

    private struct Note {
        var frequency: Double
        var start: Double
        var length: Double
        var gain = 0.5
        var glideTo: Double?
    }

    private static func notes(for cue: Cue) -> [Note] {
        switch cue {
        case .tap: [Note(frequency: 880, start: 0, length: 0.05, gain: 0.25)]
        case .correct: [Note(frequency: 659.3, start: 0, length: 0.12), Note(frequency: 987.8, start: 0.09, length: 0.22)]
        case .stamp: [Note(frequency: 110, start: 0, length: 0.16, gain: 0.7, glideTo: 70), Note(frequency: 659.3, start: 0.05, length: 0.12), Note(frequency: 987.8, start: 0.14, length: 0.14), Note(frequency: 1318.5, start: 0.23, length: 0.3)]
        case .near: [Note(frequency: 440, start: 0, length: 0.16, gain: 0.4), Note(frequency: 392, start: 0.11, length: 0.2, gain: 0.4)]
        case .miss: [Note(frequency: 196, start: 0, length: 0.26, gain: 0.55, glideTo: 130)]
        case .finish: [Note(frequency: 523.3, start: 0, length: 0.16), Note(frequency: 659.3, start: 0.1, length: 0.16), Note(frequency: 784, start: 0.2, length: 0.16), Note(frequency: 1046.5, start: 0.3, length: 0.45)]
        case .medal: [Note(frequency: 784, start: 0, length: 0.12), Note(frequency: 1174.7, start: 0.1, length: 0.12), Note(frequency: 1568, start: 0.2, length: 0.4)]
        }
    }

    private static func render(_ cue: Cue, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        let notes = notes(for: cue)
        let rate = format.sampleRate
        let duration = (notes.map { $0.start + $0.length }.max() ?? 0.1) + 0.02
        let frames = AVAudioFrameCount(duration * rate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames), let channel = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = frames
        for i in 0..<Int(frames) { channel[i] = 0 }
        for note in notes {
            let first = Int(note.start * rate)
            let count = Int(note.length * rate)
            var phase = 0.0
            for i in 0..<count where first + i < Int(frames) {
                let t = Double(i) / Double(count)
                let frequency = note.glideTo.map { note.frequency + ($0 - note.frequency) * t } ?? note.frequency
                phase += 2 * .pi * frequency / rate
                // A soft bell: a sine with a little of its octave, a 4 ms attack and an exponential tail.
                let attack = min(1, Double(i) / (0.004 * rate))
                let envelope = attack * exp(-4.5 * t)
                channel[first + i] += Float((sin(phase) + 0.25 * sin(2 * phase)) * envelope * note.gain * 0.6)
            }
        }
        return buffer
    }
}
