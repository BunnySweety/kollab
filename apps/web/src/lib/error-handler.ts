import { ApiError } from './api-client';
import { toast } from 'svelte-sonner';
import { log } from './logger';

/**
 * User-friendly error messages based on error type and status
 */
const ERROR_MESSAGES: Record<number, string> = {
  400: 'La requête est invalide. Veuillez vérifier vos données.',
  401: 'Vous devez être connecté pour effectuer cette action.',
  403: 'Vous n\'avez pas les permissions nécessaires pour effectuer cette action.',
  404: 'La ressource demandée n\'a pas été trouvée.',
  409: 'Un conflit est survenu. Cette ressource existe déjà.',
  413: 'Le fichier est trop volumineux. Veuillez choisir un fichier plus petit.',
  422: 'Les données fournies ne sont pas valides. Veuillez vérifier les champs.',
  429: 'Trop de requêtes. Veuillez patienter quelques instants.',
  500: 'Une erreur serveur est survenue. Veuillez réessayer plus tard.',
  502: 'Le serveur est temporairement indisponible. Veuillez réessayer plus tard.',
  503: 'Le service est temporairement indisponible. Veuillez réessayer plus tard.',
};

/**
 * Context-specific error messages
 */
const CONTEXT_MESSAGES: Record<string, Record<string, string>> = {
  load: {
    projects: 'Impossible de charger les projets. Veuillez réessayer.',
    tasks: 'Impossible de charger les tâches. Veuillez réessayer.',
    events: 'Impossible de charger les événements. Veuillez réessayer.',
    teams: 'Impossible de charger les équipes. Veuillez réessayer.',
    documents: 'Impossible de charger les documents. Veuillez réessayer.',
    folders: 'Impossible de charger les dossiers. Veuillez réessayer.',
    files: 'Impossible de charger les fichiers. Veuillez réessayer.',
  },
  create: {
    project: 'Impossible de créer le projet. Veuillez vérifier les informations.',
    task: 'Impossible de créer la tâche. Veuillez vérifier les informations.',
    event: 'Impossible de créer l\'événement. Veuillez vérifier les informations.',
    team: 'Impossible de créer l\'équipe. Veuillez vérifier les informations.',
    document: 'Impossible de créer le document. Veuillez vérifier les informations.',
    folder: 'Impossible de créer le dossier. Veuillez vérifier les informations.',
  },
  update: {
    project: 'Impossible de mettre à jour le projet. Veuillez réessayer.',
    task: 'Impossible de mettre à jour la tâche. Veuillez réessayer.',
    event: 'Impossible de mettre à jour l\'événement. Veuillez réessayer.',
    team: 'Impossible de mettre à jour l\'équipe. Veuillez réessayer.',
    document: 'Impossible de mettre à jour le document. Veuillez réessayer.',
    folder: 'Impossible de mettre à jour le dossier. Veuillez réessayer.',
  },
  delete: {
    project: 'Impossible de supprimer le projet. Veuillez réessayer.',
    task: 'Impossible de supprimer la tâche. Veuillez réessayer.',
    event: 'Impossible de supprimer l\'événement. Veuillez réessayer.',
    team: 'Impossible de supprimer l\'équipe. Veuillez réessayer.',
    document: 'Impossible de supprimer le document. Veuillez réessayer.',
    folder: 'Impossible de supprimer le dossier. Veuillez réessayer.',
    file: 'Impossible de supprimer le fichier. Veuillez réessayer.',
  },
  upload: {
    file: 'Impossible d\'uploader le fichier. Vérifiez la taille et le type du fichier.',
    cover: 'Impossible d\'uploader l\'image de couverture. Vérifiez le format et la taille.',
    avatar: 'Impossible d\'uploader l\'avatar. Vérifiez le format et la taille.',
  },
};

const NETWORK_MESSAGE = 'Erreur de connexion. Vérifiez votre connexion internet et réessayez.';
const UNKNOWN_MESSAGE = 'Une erreur inattendue est survenue. Veuillez réessayer.';

/**
 * Extract user-friendly error message from an error
 */
export function getErrorMessage(
  error: unknown,
  context?: { action?: string; resource?: string }
): string {
  // Handle ApiError with status code
  if (error instanceof ApiError) {
    // Check for context-specific message first
    if (context?.action && context?.resource) {
      const contextKey = context.action as keyof typeof CONTEXT_MESSAGES;
      const resourceKey = context.resource;
      if (CONTEXT_MESSAGES[contextKey]?.[resourceKey]) {
        return CONTEXT_MESSAGES[contextKey][resourceKey];
      }
    }

    // Check for status-specific message
    if (ERROR_MESSAGES[error.status]) {
      return ERROR_MESSAGES[error.status];
    }

    // Use error message from API if available
    if (error.message && error.message !== 'Request failed') {
      return error.message;
    }
  }

  // Handle standard Error
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch') || error.message.includes('network')) {
      return NETWORK_MESSAGE;
    }

    // Use error message if it's user-friendly
    if (error.message && !error.message.includes('Failed to')) {
      return error.message;
    }
  }

  // Default message
  return UNKNOWN_MESSAGE;
}

/**
 * Handle error and show toast notification
 * @param error - The error to handle
 * @param context - Optional context for better error messages
 * @param options - Additional options
 */
export function handleError(
  error: unknown,
  context?: { action?: string; resource?: string },
  options?: {
    showToast?: boolean;
    logError?: boolean;
    logContext?: Record<string, unknown>;
  }
): string {
  const message = getErrorMessage(error, context);
  const { showToast = true, logError = true, logContext = {} } = options || {};

  // Log error for debugging
  if (logError) {
    log.error(
      `Error: ${context?.action || 'unknown'} ${context?.resource || 'resource'}`,
      error instanceof Error ? error : new Error(String(error)),
      {
        ...logContext,
        status: error instanceof ApiError ? error.status : undefined,
        data: error instanceof ApiError ? error.data : undefined,
      }
    );
  }

  // Show toast notification
  if (showToast) {
    toast.error(message);
  }

  return message;
}

/**
 * Handle error silently (no toast, but still logged)
 * Useful for background operations
 */
export function handleErrorSilently(
  error: unknown,
  context?: { action?: string; resource?: string },
  logContext?: Record<string, unknown>
): string {
  return handleError(error, context, {
    showToast: false,
    logError: true,
    logContext,
  });
}

/**
 * Check if error is a specific HTTP status
 */
export function isErrorStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status >= 500;
  }
  if (error instanceof Error) {
    return error.message.includes('fetch') || error.message.includes('network');
  }
  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  return isErrorStatus(error, 401) || isErrorStatus(error, 403);
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  return isErrorStatus(error, 400) || isErrorStatus(error, 422);
}

