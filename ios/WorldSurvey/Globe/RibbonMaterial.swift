import SceneKit
import simd

/// A flat-coloured material for ribbons built by `GlobeGeometry.ribbons`.
final class RibbonMaterial {
    let material = SCNMaterial()
    /// Line width on screen, in points.
    let points: Double

    init(color: UIColor, points: Double) {
        self.points = points
        material.lightingModel = .constant
        material.diffuse.contents = color
        material.isDoubleSided = true
        material.writesToDepthBuffer = false
        material.shaderModifiers = [
            .geometry: """
            #pragma arguments
            float halfWidth;
            #pragma body
            _geometry.position.xyz += _geometry.normal * (_geometry.texcoords[0].x * halfWidth);
            """
        ]
        setHalfWidth(0.001)
    }

    func setHalfWidth(_ world: Double) {
        material.setValue(NSNumber(value: Float(world)), forKey: "halfWidth")
    }
}
