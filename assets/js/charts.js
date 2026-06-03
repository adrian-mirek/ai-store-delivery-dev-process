(function () {
  function drawValueChart(canvas, labels, values) {
    if (!canvas || !canvas.getContext) {
      return;
    }

    var ctx = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    var padding = { top: 30, right: 22, bottom: 70, left: 58 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var max = 100;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#1b2333";
    ctx.font = "600 18px Space Grotesk";
    ctx.fillText("Expected Improvement by AI Workflow", padding.left, 18);

    ctx.strokeStyle = "#d6c9b7";
    ctx.lineWidth = 1;
    for (var y = 0; y <= 5; y += 1) {
      var yPos = padding.top + (chartHeight / 5) * y;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();

      var tickValue = max - (max / 5) * y;
      ctx.fillStyle = "#526075";
      ctx.font = "12px Space Grotesk";
      ctx.fillText(String(Math.round(tickValue)) + "%", 14, yPos + 4);
    }

    var barGap = 24;
    var barWidth = (chartWidth - barGap * (values.length - 1)) / values.length;

    values.forEach(function (value, index) {
      var x = padding.left + index * (barWidth + barGap);
      var barHeight = (Math.max(0, Math.min(max, value)) / max) * chartHeight;
      var y = padding.top + chartHeight - barHeight;

      var gradient = ctx.createLinearGradient(x, y, x + barWidth, y + barHeight);
      gradient.addColorStop(0, "#0f4c5c");
      gradient.addColorStop(1, "#e68a00");

      ctx.fillStyle = gradient;
      roundRect(ctx, x, y, barWidth, barHeight, 8, true, false);

      ctx.fillStyle = "#1b2333";
      ctx.font = "700 13px Space Grotesk";
      ctx.fillText(String(value) + "%", x + barWidth * 0.26, y - 8);

      ctx.save();
      ctx.translate(x + barWidth * 0.5, height - padding.bottom + 14);
      ctx.rotate(-0.1);
      ctx.textAlign = "center";
      ctx.fillStyle = "#2a3448";
      ctx.font = "12px Space Grotesk";
      ctx.fillText(labels[index], 0, 0);
      ctx.restore();
    });
  }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    var r = Math.min(radius, height / 2, width / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }
  }

  window.presentationCharts = {
    drawValueChart: drawValueChart
  };
})();
