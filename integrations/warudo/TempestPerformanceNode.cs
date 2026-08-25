using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Cysharp.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Warudo.Core;
using Warudo.Core.Attributes;
using Warudo.Core.Graphs;
using Warudo.Core.Server;
using Warudo.Core.Utils;
using Warudo.Plugins.Core;
using WebSocketSharp.Server;

namespace TempestMainframe.Warudo {
    // Typed localhost receiver used by Studio's embedded Warudo adapter.
    public interface ITempestPerformanceHandler {
        void OnTempestPerformance(JObject data);
    }

    public static class TempestPerformanceController {
        private const int ServicePort = 4770;
        private static readonly HashSet<ITempestPerformanceHandler> Handlers = new();
        private static WebSocketServer server;

        public static async Task<bool> Subscribe(ITempestPerformanceHandler handler) {
            if (server == null) {
                try {
                    await Context.PluginManager.GetPlugin<CorePlugin>().BeforeListenToPort();
                    server = new WebSocketServer(WebSocketHelpers.CreateLocalHostUri(ServicePort));
                    server.AddWebSocketService<TempestPerformanceService>("/", service => service.Parent = typeof(TempestPerformanceController));
                    server.Start();
                    Context.PluginManager.GetPlugin<CorePlugin>().AfterListenToPort();
                    Debug.Log("[Tempest] Performance service listening on ws://localhost:" + ServicePort + "/");
                } catch (Exception exception) {
                    Debug.LogException(exception);
                    server = null;
                    return false;
                }
            }
            Handlers.Add(handler);
            return true;
        }

        public static void Unsubscribe(ITempestPerformanceHandler handler) {
            Handlers.Remove(handler);
            if (Handlers.Count != 0 || server == null) return;
            server.Stop();
            server = null;
        }

        public static void Dispatch(JObject data) {
            foreach (var handler in Handlers) handler.OnTempestPerformance(data);
        }
    }

    public class TempestPerformanceService : WebSocketService {
        public Type Parent { get; set; }

        protected override async UniTask<bool> HandleAction(string action, JObject data) {
            if (action != "tempestPerformance") return false;
            await UniTask.SwitchToMainThread();
            TempestPerformanceController.Dispatch(data);
            return true;
        }
    }

    [NodeType(Id = "7dd11f1f-29d7-46b0-a0fc-9178884a2768", Title = "Tempest Performance Cue", Category = "Tempest Streaming Studio")]
    public class TempestPerformanceNode : Node, ITempestPerformanceHandler {
        [Markdown(order: -1000)]
        public string Status = "Waiting for the Tempest local adapter on port 4770.";

        [DataInput(order: -999)]
        [Description("Exact cue, comma-separated cues, or a trailing wildcard such as sound-alert.*. Leave blank to accept every cue.")]
        public string CueFilter;

        [DataInput(order: -998)]
        [Description("Disable this node without removing its blueprint connections.")]
        public bool Enabled = true;

        private string cue;
        private string name;
        private string phase;
        private string dedupeId;
        private int durationMs;
        private float intensity;
        private bool matched;
        private int messagesReceived;

        [DataOutput] public string Cue() => cue;
        [DataOutput] public new string Name() => name;
        [DataOutput] public string Phase() => phase;
        [DataOutput] public string DedupeId() => dedupeId;
        [DataOutput] public int DurationMilliseconds() => durationMs;
        [DataOutput] public float Intensity() => intensity;
        [DataOutput] public bool Matched() => matched;
        [DataOutput] public int MessagesReceived() => messagesReceived;
        [FlowOutput] public Continuation Activate;
        [FlowOutput] public Continuation Release;

        [Trigger]
        public void TestActivate() {
            ApplyPerformance(new JObject {
                ["cue"] = LocalTestCue(),
                ["name"] = "Local Warudo Test",
                ["phase"] = "activate",
                ["durationMs"] = 5000,
                ["intensity"] = 1f,
                ["dedupeId"] = "warudo-local-test"
            }, true);
        }

        [Trigger]
        public void TestRelease() {
            ApplyPerformance(new JObject {
                ["cue"] = LocalTestCue(),
                ["name"] = "Local Warudo Test",
                ["phase"] = "release",
                ["durationMs"] = 0,
                ["intensity"] = 1f,
                ["dedupeId"] = "warudo-local-test"
            }, true);
        }

        protected override async void OnCreate() {
            base.OnCreate();
            if (await TempestPerformanceController.Subscribe(this)) {
                Status = "Ready on ws://localhost:4770/";
                BroadcastDataInput(nameof(Status));
            } else {
                Status = "Could not open port 4770. Close the other listener and reload this script.";
                BroadcastDataInput(nameof(Status));
            }
        }

        protected override void OnDestroy() {
            TempestPerformanceController.Unsubscribe(this);
            base.OnDestroy();
        }

        public void OnTempestPerformance(JObject data) {
            ApplyPerformance(data, false);
        }

        private void ApplyPerformance(JObject data, bool localTest) {
            var incomingCue = data["cue"]?.Value<string>() ?? "tempest.default";
            cue = incomingCue;
            name = data["name"]?.Value<string>() ?? cue;
            phase = data["phase"]?.Value<string>() ?? "activate";
            dedupeId = data["dedupeId"]?.Value<string>();
            durationMs = data["durationMs"]?.Value<int>() ?? 0;
            intensity = data["intensity"]?.Value<float>() ?? 1f;
            messagesReceived++;
            matched = MatchesCue(incomingCue);

            var timestamp = DateTime.Now.ToString("HH:mm:ss");
            if (!Enabled) {
                SetDataInput(nameof(Status), $"{timestamp} — Ignored {phase} for `{incomingCue}` because this node is disabled.", broadcast: true);
                return;
            }
            if (!matched) {
                SetDataInput(nameof(Status), $"{timestamp} — Received `{incomingCue}`, but it did not match `{CueFilter}`.", broadcast: true);
                return;
            }

            var source = localTest ? "Local test" : "Studio";
            SetDataInput(nameof(Status), $"{timestamp} — {source} {phase}: `{incomingCue}` ({durationMs} ms).", broadcast: true);
            InvokeFlow(phase == "release" ? nameof(Release) : nameof(Activate));
        }

        private bool MatchesCue(string incomingCue) {
            if (string.IsNullOrWhiteSpace(CueFilter)) return true;
            var filters = CueFilter.Split(new[] { ',', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (var entry in filters) {
                var filter = entry.Trim();
                if (filter == "*") return true;
                if (filter.EndsWith("*", StringComparison.Ordinal)) {
                    var prefix = filter.Substring(0, filter.Length - 1);
                    if (incomingCue.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return true;
                } else if (string.Equals(filter, incomingCue, StringComparison.OrdinalIgnoreCase)) {
                    return true;
                }
            }
            return false;
        }

        private string LocalTestCue() {
            if (string.IsNullOrWhiteSpace(CueFilter)) return "tempest.local-test";
            var filter = CueFilter.Split(new[] { ',', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0].Trim();
            return filter.EndsWith("*", StringComparison.Ordinal)
                ? filter.Substring(0, filter.Length - 1) + "local-test"
                : filter;
        }
    }
}
