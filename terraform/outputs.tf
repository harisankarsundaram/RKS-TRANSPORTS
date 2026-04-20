output "applied_resource_count" {
  description = "Number of non-namespace manifests applied"
  value       = length(kubernetes_manifest.resources)
}

output "namespace_count" {
  description = "Number of namespace manifests applied"
  value       = length(kubernetes_manifest.namespaces)
}

output "frontend_hint" {
  description = "Hint command for frontend service status"
  value       = "kubectl -n ${var.namespace} get svc frontend -o wide"
}
