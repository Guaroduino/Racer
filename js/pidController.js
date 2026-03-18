// js/pidController.js
import { clamp } from './utils.js';

export class PIDController {
    constructor(baseSpeed, Kp, Ki, Kd, maxSpeed, minSpeed = 0) {
        this.baseSpeed = baseSpeed;
        this.Kp = Kp;
        this.Ki = Ki;
        this.Kd = Kd;
        this.maxSpeed = maxSpeed;
        this.minSpeed = minSpeed;

        this.error = 0;
        this.previousError = 0;
        this.integral = 0;
        this.derivative = 0;

        this.integralMin = -200; // Default integral anti-windup limits
        this.integralMax = 200;
    }

    reset() {
        this.error = 0;
        this.previousError = 0;
        this.integral = 0;
        this.derivative = 0;
    }

    updateSettings(settings) {
        if (!settings) return;
        this.baseSpeed = settings.baseSpeed ?? this.baseSpeed;
        this.Kp = settings.Kp ?? this.Kp;
        this.Ki = settings.Ki ?? this.Ki;
        this.Kd = settings.Kd ?? this.Kd;
        this.maxSpeed = settings.maxSpeed ?? this.maxSpeed;
        this.minSpeed = settings.minSpeed ?? this.minSpeed;
        this.integralMin = settings.integralMin ?? this.integralMin;
        this.integralMax = settings.integralMax ?? this.integralMax;
    }

    calculateError(sL, sC, sR, maxValError = 2) {
        // sL, sC, sR: true if OFF line (on white), false if ON line (on black)
        // This error logic makes robot turn right for positive error.
        if (!sL && sC && sR) { // Left only on line
            this.error = -maxValError; // Turn sharply left
        } else if (!sL && !sC && sR) { // Left and Center on line
            this.error = -maxValError / 2; // Turn moderately left
        } else if (sL && !sC && sR) { // Center only on line
            this.error = 0; // Go straight
        } else if (sL && !sC && !sR) { // Center and Right on line
            this.error = maxValError / 2; // Turn moderately right
        } else if (sL && sC && !sR) { // Right only on line
            this.error = maxValError; // Turn sharply right
        } else if (sL && sC && sR) { // All sensors off line (lost)
            // Keep previous error or implement lost line strategy
            // For simplicity, if very positive error, keep turning right, if very negative, keep turning left
            if (this.previousError > maxValError / 2) this.error = maxValError * 1.5; // Aggressively continue
            else if (this.previousError < -maxValError / 2) this.error = -maxValError * 1.5; // Aggressively continue
            else this.error = this.previousError; // Or maintain last error
        } else if (!sL && !sC && !sR) { // All sensors on line (e.g. intersection or end)
            this.error = 0; // Go straight or implement intersection logic
        }
        // else: Unhandled combination, error remains from previous state
    }

    computeOutput(dt) {
        this.integral += this.error * dt;
        this.integral = clamp(this.integral, this.integralMin, this.integralMax); // Anti-windup
        this.derivative = (dt > 0) ? (this.error - this.previousError) / dt : 0;
        
        const pidOutput = (this.Kp * this.error) + (this.Ki * this.integral) + (this.Kd * this.derivative);
        this.previousError = this.error;
        return pidOutput;
    }

    getMotorPWMs(pidAdjustment, motorDeadbandPWM = 0) {
        let leftSpeed = this.baseSpeed - pidAdjustment;
        let rightSpeed = this.baseSpeed + pidAdjustment;

        // Clamp speeds to [minSpeed, maxSpeed]
        leftSpeed = clamp(leftSpeed, this.minSpeed, this.maxSpeed);
        rightSpeed = clamp(rightSpeed, this.minSpeed, this.maxSpeed);

        // Apply deadband: if speed is too low, set to 0
        // This logic assumes positive speeds for forward.
        // A more complex deadband might be needed if minSpeed can be negative (for reverse)
        // but typical Arduino line followers use PWM 0-255 for forward.
        let finalLeftPWM = (Math.abs(leftSpeed) < motorDeadbandPWM && leftSpeed !== 0) ? 0 : Math.round(leftSpeed);
        let finalRightPWM = (Math.abs(rightSpeed) < motorDeadbandPWM && rightSpeed !== 0) ? 0 : Math.round(rightSpeed);
        
        return {
            leftPWM: finalLeftPWM,
            rightPWM: finalRightPWM,
            // Assuming PID output directly maps to PWM values for forward motion.
            // If negative PWMs are needed for reverse, this needs adjustment.
            // For typical line followers, both motors run forward, just at different speeds.
            leftDirForward: true, 
            rightDirForward: true
        };
    }

    getTerms() {
        return {
            P: this.Kp * this.error,
            I: this.Ki * this.integral,
            D: this.Kd * this.derivative,
            error: this.error
        };
    }
}