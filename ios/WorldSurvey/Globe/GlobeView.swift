import SceneKit
import SwiftUI

/// Hosts the SceneKit globe. SwiftUI has no 3D view with custom picking, so this one view is UIKit-backed.
struct GlobeView: UIViewRepresentable {
    let controller: GlobeController

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller) }

    func makeUIView(context: Context) -> SCNView {
        let view = SizedSceneView()
        view.onLayout = { [controller] size in controller.resize(to: size) }
        controller.attach(view)

        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        pan.maximumNumberOfTouches = 1
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pinch(_:)))
        let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.doubleTap(_:)))
        doubleTap.numberOfTapsRequired = 2
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:)))
        tap.require(toFail: doubleTap)
        for recognizer in [pan, pinch, doubleTap, tap] {
            recognizer.delegate = context.coordinator
            view.addGestureRecognizer(recognizer)
        }

        view.isAccessibilityElement = true
        view.accessibilityLabel = "Relief globe"
        view.accessibilityHint = "Drag to turn, pinch to zoom, tap a country to answer"
        view.accessibilityTraits = .allowsDirectInteraction
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {}

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        let controller: GlobeController
        private var lastPinch = 1.0

        init(controller: GlobeController) {
            self.controller = controller
        }

        @objc func pan(_ recognizer: UIPanGestureRecognizer) {
            switch recognizer.state {
            case .began:
                controller.panBegan()
            case .changed:
                controller.pan(translation: recognizer.translation(in: recognizer.view))
                recognizer.setTranslation(.zero, in: recognizer.view)
            case .ended, .cancelled, .failed:
                controller.panEnded(velocity: recognizer.velocity(in: recognizer.view))
            default:
                break
            }
        }

        @objc func pinch(_ recognizer: UIPinchGestureRecognizer) {
            switch recognizer.state {
            case .began:
                lastPinch = 1
            case .changed:
                controller.pinch(scale: Double(recognizer.scale) / lastPinch)
                lastPinch = Double(recognizer.scale)
            default:
                break
            }
        }

        @objc func tap(_ recognizer: UITapGestureRecognizer) {
            controller.tap(at: recognizer.location(in: recognizer.view))
        }

        @objc func doubleTap(_ recognizer: UITapGestureRecognizer) {
            controller.zoomIn(at: recognizer.location(in: recognizer.view))
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            gestureRecognizer is UIPinchGestureRecognizer || other is UIPinchGestureRecognizer
        }
    }
}

/// Reports its size, so the camera can keep the globe framed when the window changes.
private final class SizedSceneView: SCNView {
    var onLayout: ((CGSize) -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?(bounds.size)
    }
}
