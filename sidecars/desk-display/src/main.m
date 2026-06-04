// desk-display — 创建 macOS 虚拟显示器
// macOS 11~14 用 CoreGraphics 的 CGVirtualDisplay* 私有 C 函数（已废弃，会段错误）
// macOS 15+   用 SkyLight.framework 的 SLVirtualDisplay* 私有 ObjC 类（本实现）
//
// 用法：
//   ./desk-display [--width N] [--height N] [--hz N] [--name "..."]
// stdout：单行 JSON {"display_id":N,"width":W,"height":H,"name":"..."}
// stderr：进度日志 [desk-display] ...
// 终止：Ctrl+C / SIGTERM / SIGHUP / stdin EOF / stdin "quit\n"
#import "SkyLightPrivate.h"
#import <signal.h>
#import <stdio.h>
#import <stdlib.h>
#import <string.h>

// 持久化引用 —— 信号处理回调要访问
static SLVirtualDisplay *gDisplay = nil;

typedef struct {
    uint32_t width;
    uint32_t height;
    float    refreshRate;
    NSString *name;
} Options;

static Options parseArgs(int argc, char *argv[]) {
    Options opts = {
        .width = 1920,
        .height = 1080,
        .refreshRate = 60.0f,
        .name = @"desk virtual display",
    };
    for (int i = 1; i < argc; i++) {
        NSString *arg = [NSString stringWithUTF8String:argv[i]];
        if ([arg isEqualToString:@"--width"] && i + 1 < argc) {
            opts.width = (uint32_t)atoi(argv[++i]);
        } else if ([arg isEqualToString:@"--height"] && i + 1 < argc) {
            opts.height = (uint32_t)atoi(argv[++i]);
        } else if ([arg isEqualToString:@"--hz"] && i + 1 < argc) {
            opts.refreshRate = atof(argv[++i]);
        } else if ([arg isEqualToString:@"--name"] && i + 1 < argc) {
            opts.name = [NSString stringWithUTF8String:argv[++i]];
        } else if ([arg isEqualToString:@"-h"] || [arg isEqualToString:@"--help"]) {
            printf("Usage: desk-display [--width N] [--height N] [--hz N] [--name STR]\n");
            exit(0);
        } else {
            fprintf(stderr, "[desk-display] unknown arg: %s\n", argv[i]);
        }
    }
    return opts;
}

static void cleanup(int sig) {
    fprintf(stderr, "[desk-display] cleanup (sig=%d) — destroying virtual display\n", sig);
    // ObjC 方法在信号上下文里不严格 async-signal-safe，但实测可用，
    // 失败时 exit 也会让 OS 清掉
    @try { [gDisplay destroy]; } @catch (NSException *e) {}
    exit(0);
}

int main(int argc, char *argv[]) {
    @autoreleasepool {
        Options opts = parseArgs(argc, argv);
        NSError *err = nil;

        // 1) Configuration — 这台"显示器"的固定属性（厂商、产品、物理尺寸等）
        SLPhysicalSize mmSize = {
            .width  = opts.width  * 25.4f / 96.0f,
            .height = opts.height * 25.4f / 96.0f,
        };
        SLPixelSize maxPixels = { .width = opts.width, .height = opts.height };
        SLChromaticities chroma = {
            // sRGB 色域
            .red   = { .x = 0.640f, .y = 0.330f },
            .green = { .x = 0.300f, .y = 0.600f },
            .blue  = { .x = 0.150f, .y = 0.060f },
            .white = { .x = 0.3127f, .y = 0.3290f }, // D65
        };

        SLVirtualDisplayConfiguration *config =
            [[SLVirtualDisplayConfiguration alloc] initWithName:opts.name
                                                       vendorID:0xDE5C
                                                      productID:0xDE5C
                                                   serialNumber:0x0001
                                              sizeInMillimeters:mmSize
                                            maximumSizeInPixels:maxPixels
                                                 chromaticities:chroma
                                                          error:&err];
        if (!config) {
            fprintf(stderr, "[desk-display] SLVirtualDisplayConfiguration init failed: %s\n",
                    err.localizedDescription.UTF8String ?: "(no error info)");
            return 1;
        }
        fprintf(stderr, "[desk-display] config ok\n");

        // 2) Mode — 这台显示器要支持的分辨率/刷新率（这里只给一种）
        SLPixelSize px = { .width = opts.width, .height = opts.height };
        SLVirtualDisplayMode *mode =
            [[SLVirtualDisplayMode alloc] initWithSizeInPixels:px
                                                  sizeInPoints:px
                                                   refreshRate:opts.refreshRate
                                                         error:&err];
        if (!mode) {
            fprintf(stderr, "[desk-display] SLVirtualDisplayMode init failed: %s\n",
                    err.localizedDescription.UTF8String ?: "(no error info)");
            return 1;
        }
        fprintf(stderr, "[desk-display] mode ok\n");

        // 3) Settings — 当前活动模式 + 候选模式 + 允许的旋转
        SLVirtualDisplaySettings *settings =
            [[SLVirtualDisplaySettings alloc] initWithNativeMode:mode
                                                   preferredMode:mode
                                                   optionalModes:@[]
                                                       rotations:0
                                                           error:&err];
        if (!settings) {
            fprintf(stderr, "[desk-display] SLVirtualDisplaySettings init failed: %s\n",
                    err.localizedDescription.UTF8String ?: "(no error info)");
            return 1;
        }
        fprintf(stderr, "[desk-display] settings ok\n");

        // 4) 实例化虚拟显示器
        gDisplay = [[SLVirtualDisplay alloc] initWithConfiguration:config error:&err];
        if (!gDisplay) {
            fprintf(stderr, "[desk-display] SLVirtualDisplay init failed: %s\n",
                    err.localizedDescription.UTF8String ?: "(no error info)");
            return 1;
        }
        fprintf(stderr, "[desk-display] SLVirtualDisplay created\n");

        // 5) 应用 settings —— 此时 OS 会把它识别为新显示器
        if (![gDisplay applySettings:settings error:&err]) {
            fprintf(stderr, "[desk-display] applySettings failed: %s\n",
                    err.localizedDescription.UTF8String ?: "(no error info)");
            return 1;
        }
        fprintf(stderr, "[desk-display] applySettings ok — display registered\n");

        uint32_t displayID = gDisplay.displayID;
        NSDictionary *info = @{
            @"display_id": @(displayID),
            @"width":      @(opts.width),
            @"height":     @(opts.height),
            @"name":       opts.name,
        };
        NSData *json = [NSJSONSerialization dataWithJSONObject:info options:0 error:nil];
        if (json) {
            [[NSFileHandle fileHandleWithStandardOutput] writeData:json];
            [[NSFileHandle fileHandleWithStandardOutput] writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
        }
        fprintf(stderr, "[desk-display] display_id=%u — running until SIGINT / stdin close\n", displayID);

        // 信号
        signal(SIGINT,  cleanup);
        signal(SIGTERM, cleanup);
        signal(SIGHUP,  cleanup);

        // stdin EOF —— 父进程关 pipe 时收尸
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
            char line[256];
            while (fgets(line, sizeof(line), stdin)) {
                size_t len = strlen(line);
                if (len > 0 && line[len-1] == '\n') line[len-1] = '\0';
                if (strcmp(line, "quit") == 0) cleanup(0);
            }
            fprintf(stderr, "[desk-display] stdin closed by parent — exit\n");
            cleanup(0);
        });

        dispatch_main();
    }
    return 0;
}
