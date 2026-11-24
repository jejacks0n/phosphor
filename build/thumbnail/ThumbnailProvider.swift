// Finder's thumbnail of a .pho: the PNG it is, drawn to fit. A .pho is declared a kind of PNG, but the system's own
// image thumbnailer refuses a type it doesn't know, so the app brings this one for its own type (build/thumbnail.mjs
// builds it into the app's PlugIns). Quick Look's preview (the space bar) is the system's, and needs nothing here.
import CoreGraphics
import ImageIO
import QuickLookThumbnailing

@objc(ThumbnailProvider)
final class ThumbnailProvider: QLThumbnailProvider {
  override func provideThumbnail(for request: QLFileThumbnailRequest, _ handler: @escaping (QLThumbnailReply?, Error?) -> Void) {
    guard let source = CGImageSourceCreateWithURL(request.fileURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      handler(nil, CocoaError(.fileReadCorruptFile))
      return
    }
    let width = CGFloat(image.width), height = CGFloat(image.height)
    let scale = min(request.maximumSize.width / width, request.maximumSize.height / height)
    let size = CGSize(width: max(1, (width * scale).rounded()), height: max(1, (height * scale).rounded()))
    handler(QLThumbnailReply(contextSize: size) { context in
      // Cells stay square-edged when a small drawing is drawn up; a large one is smoothed down.
      context.interpolationQuality = scale > 1 ? .none : .high
      // The whole context, whatever the screen's scale makes it in pixels.
      context.draw(image, in: context.boundingBoxOfClipPath)
      return true
    }, nil)
  }
}
