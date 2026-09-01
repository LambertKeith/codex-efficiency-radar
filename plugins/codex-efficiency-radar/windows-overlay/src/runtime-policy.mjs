export function injectorFailed(result) {
  return Boolean(result?.error || result?.signal || result?.code !== 0);
}

export function injectorFailureReason(result) {
  if (result?.error) return result.error.message;
  if (result?.signal) return `注入器被信号 ${result.signal} 终止`;
  return `注入器退出码 ${result?.code}`;
}

export function circuitBreakerState(reason, details = {}, now = new Date()) {
  return {
    disabledAt: now.toISOString(),
    reason,
    ...details
  };
}
