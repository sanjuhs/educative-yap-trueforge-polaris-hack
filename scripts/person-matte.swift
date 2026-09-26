import Foundation
import AVFoundation
import Vision
import CoreImage

// The normalized source is 30 fps; infer every other frame and encode a 15 fps matte.
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let output = CommandLine.arguments[2]
let asset = AVURLAsset(url: source)
let tracks = try await asset.loadTracks(withMediaType: .video)
guard let track = tracks.first else { fatalError("No video track") }
let reader = try AVAssetReader(asset: asset)
let video = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
video.alwaysCopiesSampleData = false
reader.add(video)
guard reader.startReading() else { throw reader.error! }
let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = .accurate
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
let sequence = VNSequenceRequestHandler()
let context = CIContext(options: [.cacheIntermediates: false])
let width = 480, height = 854
let encoder = Process(), pipe = Pipe()
encoder.executableURL = URL(fileURLWithPath: "/usr/bin/env")
encoder.arguments = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "480x854", "-r", "15", "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", output]
encoder.standardInput = pipe
try encoder.run()
var index = 0, frames = 0
while let sample = video.copyNextSampleBuffer() {
    defer { index += 1 }
    if index % 2 != 0 { continue }
    try autoreleasepool {
        guard let pixel = CMSampleBufferGetImageBuffer(sample) else { return }
        try sequence.perform([request], on: pixel)
        guard let mask = request.results?.first?.pixelBuffer else { throw NSError(domain: "PersonMatte", code: 1, userInfo: [NSLocalizedDescriptionKey: "No person mask produced"]) }
        let image = CIImage(cvPixelBuffer: mask)
        let resized = image.transformed(by: CGAffineTransform(scaleX: CGFloat(width)/image.extent.width, y: CGFloat(height)/image.extent.height))
        var bytes = [UInt8](repeating: 0, count: width*height)
        context.render(resized, toBitmap: &bytes, rowBytes: width, bounds: CGRect(x: 0, y: 0, width: width, height: height), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
        try pipe.fileHandleForWriting.write(contentsOf: Data(bytes))
        frames += 1
        if frames % 45 == 0 { print("Apple Vision matte: \(frames) frames") }
    }
}
try pipe.fileHandleForWriting.close()
encoder.waitUntilExit()
if reader.status == .failed { throw reader.error! }
if encoder.terminationStatus != 0 { throw NSError(domain: "PersonMatte", code: 2, userInfo: [NSLocalizedDescriptionKey: "Matte encoder failed"]) }
print("Apple Vision matte complete: \(frames) frames")
