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
  k8s_dir = abspath("${path.module}/../k8s")
  namespace_docs_count = length(local.namespace_docs)
  other_docs_count     = length(local.other_docs)
}

resource "terraform_data" "apply_kubernetes_manifests" {
  input = {
    kube_context = var.kube_context
    k8s_dir      = local.k8s_dir
    doc_count    = length(local.docs)
    namespace    = var.namespace
  }

  provisioner "local-exec" {
    interpreter = ["PowerShell", "-NoProfile", "-Command"]
    command     = "kubectl --context ${var.kube_context} apply -k '${local.k8s_dir}'"
  }
}
