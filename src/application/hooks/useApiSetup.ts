"use client";

// Application Layer: API 셋업 상태 관리 훅

import { useState, useCallback } from "react";
import { API_REGISTRY } from "@/domain/entities/api-registry";
import { ApiSetupStep } from "@/domain/types";

export function useApiSetup() {
  const [steps, setSteps] = useState<ApiSetupStep[]>(API_REGISTRY);

  const toggleComplete = useCallback((id: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, isCompleted: !step.isCompleted } : step
      )
    );
  }, []);

  const completedCount = steps.filter((s) => s.isCompleted).length;
  const totalCount = steps.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return { steps, toggleComplete, completedCount, totalCount, progressPercent };
}
