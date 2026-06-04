// SkyLightPrivate.h — macOS 15 起 Apple 把虚拟显示器 API 从 CoreGraphics CG* C 函数
// 迁到 SkyLight.framework 的 SL* Objective-C 类，全私有。
//
// 类与方法签名通过运行时 introspect 得到（class_copyMethodList / class_copyPropertyList）。
// 详见 src/probe_sl.m。
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// ── 几何 struct（匹配运行时 type encoding） ─────────────────────────────
// 像素尺寸 {?=II} — 两个 uint32_t
typedef struct {
    uint32_t width;
    uint32_t height;
} SLPixelSize;

// 物理尺寸 {?=ff} — 两个 float
typedef struct {
    float width;
    float height;
} SLPhysicalSize;

// 色度坐标 {?=ff}
typedef struct {
    float x;
    float y;
} SLChromaticity;

// 4 个色度（红绿蓝白）
typedef struct {
    SLChromaticity red;
    SLChromaticity green;
    SLChromaticity blue;
    SLChromaticity white;
} SLChromaticities;

// ── SLVirtualDisplayMode ─────────────────────────────────────────────
@interface SLVirtualDisplayMode : NSObject
- (nullable instancetype)initWithSizeInPixels:(SLPixelSize)sizeInPixels
                                 sizeInPoints:(SLPixelSize)sizeInPoints
                                  refreshRate:(float)refreshRate
                                        error:(NSError **)error;
@property (readonly) SLPixelSize sizeInPixels;
@property (readonly) SLPixelSize sizeInPoints;
@property (readonly) float refreshRate;
@property uint64_t options;
@end

// ── SLVirtualDisplaySettings ─────────────────────────────────────────
@interface SLVirtualDisplaySettings : NSObject
- (nullable instancetype)initWithNativeMode:(SLVirtualDisplayMode *)nativeMode
                              preferredMode:(SLVirtualDisplayMode *)preferredMode
                              optionalModes:(NSArray<SLVirtualDisplayMode *> *)optionalModes
                                  rotations:(uint64_t)rotations
                                      error:(NSError **)error;
@end

// ── SLVirtualDisplayConfiguration ────────────────────────────────────
@interface SLVirtualDisplayConfiguration : NSObject
- (nullable instancetype)initWithName:(NSString *)name
                             vendorID:(uint64_t)vendorID
                            productID:(uint64_t)productID
                         serialNumber:(uint64_t)serialNumber
                    sizeInMillimeters:(SLPhysicalSize)sizeInMillimeters
                  maximumSizeInPixels:(SLPixelSize)maximumSizeInPixels
                       chromaticities:(SLChromaticities)chromaticities
                                error:(NSError **)error;
@property uint64_t options;
@property uint64_t type;
@property uint64_t subtype;
@property (copy, nullable) NSString *uti;
@end

// ── SLVirtualDisplay ─────────────────────────────────────────────────
@protocol SLVirtualDisplayDelegate <NSObject>
@end

@interface SLVirtualDisplay : NSObject
- (nullable instancetype)initWithConfiguration:(SLVirtualDisplayConfiguration *)configuration
                                         error:(NSError **)error;
- (BOOL)applySettings:(SLVirtualDisplaySettings *)settings error:(NSError **)error;
- (void)destroy;
@property (readonly) uint32_t displayID;
@property (weak, nullable) id<SLVirtualDisplayDelegate> delegate;
@end

NS_ASSUME_NONNULL_END
