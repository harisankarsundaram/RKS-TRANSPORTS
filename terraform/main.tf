provider "kubernetes" {
  config_path    = pathexpand(var.kubeconfig_path)
  config_context = var.kube_context
}

locals {
  kustomization = yamldecode(file("${path.module}/../k8s/kustomization.yaml"))

  resource_files = [
    for rel in local.kustomization.resources :
    "${path.module}/../k8s/${rel}"
  ]

  split_docs = flatten([
    for f in local.resource_files : [
      for doc in split("\n---\n", replace(file(f), "\r\n", "\n")) : {
        file = f
        body = trimspace(doc)
      }
    ]
  ])

  docs = [
    for entry in local.split_docs : merge(entry, {
      manifest = yamldecode(entry.body)
    })
    if entry.body != ""
  ]

  namespace_docs = {
    for idx, entry in local.docs :
    format("%03d-namespace-%s", idx, lower(try(entry.manifest.metadata.name, "default"))) => entry
    if lower(try(entry.manifest.kind, "")) == "namespace"
  }

  other_docs = {
    for idx, entry in local.docs :
    format(
      "%03d-%s-%s",
      idx,
      lower(try(entry.manifest.kind, "object")),
      lower(try(entry.manifest.metadata.name, "noname"))
    ) => entry
    if lower(try(entry.manifest.kind, "")) != "namespace"
  }
}

resource "kubernetes_manifest" "namespaces" {
  for_each = local.namespace_docs

  manifest = each.value.manifest
}

resource "kubernetes_manifest" "resources" {
  for_each = local.other_docs

  manifest = each.value.manifest

  depends_on = [kubernetes_manifest.namespaces]
}
