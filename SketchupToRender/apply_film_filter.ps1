param (
    [string]$InputPath,
    [string]$OutputPath,
    [double]$NoiseAmount = 0.04,
    [int]$RedTint = 8,
    [int]$GreenTint = 2,
    [int]$BlueTint = -8
)

# Load System.Drawing assembly
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class FilmFilter {
    public static void Apply(string inputPath, string outputPath, double noiseAmount, int redTint, int greenTint, int blueTint) {
        using (Bitmap bmp = new Bitmap(inputPath)) {
            BitmapData data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int bytes = Math.Abs(data.Stride) * bmp.Height;
            byte[] rgbValues = new byte[bytes];
            Marshal.Copy(data.Scan0, rgbValues, 0, bytes);

            Random rand = new Random();

            for (int i = 0; i < rgbValues.Length; i += 4) {
                int b = rgbValues[i];
                int g = rgbValues[i+1];
                int r = rgbValues[i+2];

                // 1. Warm Kodak Portra Color Tint
                r = Math.Min(255, Math.Max(0, r + redTint));
                g = Math.Min(255, Math.Max(0, g + greenTint));
                b = Math.Min(255, Math.Max(0, b + blueTint));

                // 2. Film Grain Noise
                double noise = (rand.NextDouble() * 2.0 - 1.0) * noiseAmount * 255.0;
                r = Math.Min(255, Math.Max(0, (int)(r + noise)));
                g = Math.Min(255, Math.Max(0, (int)(g + noise)));
                b = Math.Min(255, Math.Max(0, (int)(b + noise)));

                rgbValues[i] = (byte)b;
                rgbValues[i+1] = (byte)g;
                rgbValues[i+2] = (byte)r;
            }

            Marshal.Copy(rgbValues, 0, data.Scan0, bytes);
            bmp.UnlockBits(data);
            
            bmp.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

[FilmFilter]::Apply($InputPath, $OutputPath, $NoiseAmount, $RedTint, $GreenTint, $BlueTint)
