variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Kubernetes context name used by Terraform"
  type        = string
  default     = "rks"
}

variable "namespace" {
  description = "Primary namespace for this stack"
  type        = string
  default     = "rks-logistics"
}
